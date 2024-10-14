const { DeviceCodeCredential } = require('@azure/identity');
const { ApplicationClient } = require('@azure/arm-managedapplications');
const { SubscriptionClient } = require('@azure/arm-subscriptions');
const { ipcRenderer, clipboard } = require('electron');
const XLSX = require('xlsx');

let abortController = null;
let credential = null;
let tokenExpirationTime = null;
let managedApplications = [];

// Default customer list URL
let customerListURL = "https://drmigratecode.blob.core.windows.net/marketplace-deployments/DrMigrateCustomerVersionInformationReport.xlsx?sp=r&st=2024-10-14T12:04:16Z&se=2099-10-14T20:04:16Z&spr=https&sv=2022-11-02&sr=b&sig=ePwMdva3AZQamDZBDDE3WbNLPCbc2Ffub9fWyCRoBnY%3D";

// Load tenants from localStorage or default to the current ones
let tenants = JSON.parse(localStorage.getItem('tenants')) || {
  '95e3e402-49e1-4ad0-b73d-18c03e864448': 'Altra',
  'e65107ae-deaa-4f76-b79e-c4b5067a5929': 'Lab3',
};

// Load customer list URL from localStorage or set default
customerListURL = localStorage.getItem('customerListURL') || customerListURL;

// Load tenants into the tenant dropdown
function loadTenantsDropdown() {
  const tenantSelect = document.getElementById('tenant-select');
  tenantSelect.innerHTML = ''; // Clear existing options

  for (const tenantId in tenants) {
    const option = document.createElement('option');
    option.value = tenantId;
    option.textContent = tenants[tenantId];
    tenantSelect.appendChild(option);
  }
}

// Add a new tenant to the tenant list and update localStorage
function addTenant() {
  const tenantId = document.getElementById('tenant-id-input').value;
  const tenantDomain = document.getElementById('tenant-domain-input').value;

  if (tenantId && tenantDomain) {
    tenants[tenantId] = tenantDomain;
    localStorage.setItem('tenants', JSON.stringify(tenants));
    alert("Tenant added successfully!");
    loadTenantsDropdown();  // Update the dropdown in the search tab
    loadTenantList();  // Reload the tenant list in the admin tab
  } else {
    alert("Please enter both Tenant ID and Tenant Domain.");
  }
}

// Load tenants into the admin list
function loadTenantList() {
  const tenantList = document.getElementById('tenant-list');
  tenantList.innerHTML = ''; // Clear the current list

  for (const tenantId in tenants) {
    const tenantDomain = tenants[tenantId];
    const li = document.createElement('li');
    li.textContent = `Tenant ID: ${tenantId}, Domain: ${tenantDomain}`;
    
    // Add delete button for each tenant
    const deleteButton = document.createElement('button');
    deleteButton.textContent = "Remove";
    deleteButton.onclick = function() {
      delete tenants[tenantId]; // Remove tenant
      localStorage.setItem('tenants', JSON.stringify(tenants));
      loadTenantsDropdown();  // Update dropdown when a tenant is removed
      loadTenantList();  // Reload tenant list
    };

    li.appendChild(deleteButton);
    tenantList.appendChild(li);
  }
}

// Function to check if token is expired
function checkTokenExpiration() {
  if (tokenExpirationTime && new Date().getTime() > tokenExpirationTime) {
    console.log("Token has expired. Showing login button.");
    document.getElementById('login-button').style.display = 'block'; // Show login button
    document.getElementById('logout-button').style.display = 'none'; // Hide logout button
  }
}

// Set interval to check token expiration every minute (60000 ms)
setInterval(checkTokenExpiration, 60000);

// Function to load customer data from the Excel file
async function loadCustomerData() {
  console.log(`Loading customer data from URL: ${customerListURL}`);

  try {
    const response = await fetch(customerListURL);
    const data = await response.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const customerData = XLSX.utils.sheet_to_json(firstSheet);

    console.log("Customer data loaded successfully.");
    return customerData;
  } catch (error) {
    console.error("Error loading customer data:", error);
    return [];
  }
}

async function loginToAzure() {
  console.log("Login button clicked - attempting Azure login");

  const selectedTenantId = document.getElementById('tenant-select').value;
  const selectedTenantDomain = tenants[selectedTenantId] || 'Unknown Tenant';

  console.log(`Selected Tenant ID: ${selectedTenantId}, Domain: ${selectedTenantDomain}`);

  abortController = new AbortController();
  const signal = abortController.signal;

  try {
    document.getElementById('login-prompt').style.display = 'block';  // Show login prompt container
    document.getElementById('refresh-button').style.display = 'block';
    document.getElementById('cancel-button').style.display = 'block';

    credential = new DeviceCodeCredential({
      tenantId: selectedTenantId, // Use the selected tenant ID
      userPromptCallback: (info) => {
        console.log("Device Login Prompt:", info.message);
        clipboard.writeText(info.userCode); // Copy code to clipboard
        showLoginPrompt(info); // Show prompt with login page button
      },
    });

    const scope = "https://management.azure.com/.default";
    console.log("Attempting to retrieve token...");
    let tokenResponse = await credential.getToken(scope);

    if (tokenResponse) {
      console.log("Token successfully acquired:", tokenResponse.token);
      tokenExpirationTime = new Date().getTime() + (tokenResponse.expiresIn * 1000);

      document.getElementById('login-button').style.display = 'none';
      document.getElementById('login-prompt').style.display = 'none';
      document.getElementById('tenant-name').textContent = selectedTenantDomain;
      document.getElementById('tenant-info').style.display = 'block';
      document.getElementById('logout-button').style.display = 'block';

      const subscriptionList = await getSubscriptions(credential);
      const subscriptionIds = subscriptionList.map(sub => sub.id);

      if (subscriptionIds.length === 0) {
        console.log("No subscriptions found.");
        return;
      }

      const progressContainer = document.getElementById('progress-container');
      progressContainer.style.display = 'block';
      document.getElementById('loading-message').style.display = 'block';

      const progressBar = document.getElementById('progress-bar');
      const progressText = document.getElementById('progress-text');
      const totalSubscriptions = subscriptionIds.length;
      let processedSubscriptions = 0;

      managedApplications = [];

      const customerData = await loadCustomerData(); // Load customer data for matching

      for (const subscription of subscriptionList) {
        if (signal.aborted) {
          console.log("Data retrieval cancelled by user.");
          return;
        }

        console.log(`Fetching Managed Applications for subscription: ${subscription.name}`);
        const applicationClient = new ApplicationClient(credential, subscription.id);

        try {
          for await (const managedApp of applicationClient.applications.listBySubscription()) {
            if (signal.aborted) {
              console.log("Data retrieval cancelled while fetching managed applications.");
              return;
            }

            console.log(`Managed Application found: ${managedApp.name}`);
            const vmUrl = `https://portal.azure.com/#@${selectedTenantDomain}/resource/subscriptions/${subscription.id}/resources`;

            const matchedCustomer = customerData.find(cust => cust['Subscription Id'] === subscription.id);

            managedApplications.push({
              customerName: matchedCustomer ? matchedCustomer['CustomerName'] : 'Unknown',
              name: managedApp.name || 'N/A',
              installDate: matchedCustomer ? matchedCustomer['Install Date'] : 'N/A',
              subscriptionId: subscription.id,
              subscriptionName: subscription.name,
              resourceGroup: managedApp.id?.split('/')[4] || 'N/A',
              location: managedApp.location || 'N/A',
              url: vmUrl,
            });
          }
        } catch (error) {
          console.error(`Error while fetching Managed Applications for subscription ${subscription.id}:`, error);
        }

        processedSubscriptions++;
        const progressPercent = Math.round((processedSubscriptions / totalSubscriptions) * 100);
        progressBar.value = progressPercent;
        progressText.textContent = `Retrieving data... (${processedSubscriptions}/${totalSubscriptions} subscriptions processed)`;
      }

      progressContainer.style.display = 'none';
      document.getElementById('loading-message').style.display = 'none';
      updateTable(managedApplications);
      document.getElementById('total-applications-count').textContent = managedApplications.length;

    } else {
      console.error("Token acquisition failed.");
    }
  } catch (error) {
    if (signal.aborted) {
      console.log("Data retrieval was cancelled.");
    } else {
      console.error('Error during Azure login or fetching managed applications:', error);
    }
  }
}

async function refreshManagedApplications() {
  console.log("Refresh button clicked - refreshing Managed Applications");

  abortController = new AbortController();
  const signal = abortController.signal;

  try {
    if (!credential) {
      console.error("No valid credential found. Please login first.");
      return;
    }

    const subscriptionList = await getSubscriptions(credential);
    const subscriptionIds = subscriptionList.map(sub => sub.id);

    if (subscriptionIds.length === 0) {
      console.log("No subscriptions found.");
      return;
    }

    const progressContainer = document.getElementById('progress-container');
    progressContainer.style.display = 'block';
    document.getElementById('loading-message').style.display = 'block';

    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const totalSubscriptions = subscriptionIds.length;
    let processedSubscriptions = 0;

    managedApplications = [];

    const customerData = await loadCustomerData(); // Load customer data for matching

    for (const subscription of subscriptionList) {
      if (signal.aborted) {
        console.log("Data retrieval cancelled by user.");
        return;
      }

      console.log(`Fetching Managed Applications for subscription: ${subscription.name}`);
      const applicationClient = new ApplicationClient(credential, subscription.id);

      try {
        for await (const managedApp of applicationClient.applications.listBySubscription()) {
          if (signal.aborted) {
            console.log("Data retrieval cancelled while fetching managed applications.");
            return;
          }

          console.log(`Managed Application found: ${managedApp.name}`);
          const vmUrl = `https://portal.azure.com/#@${tenants[subscription.id]}/resource/subscriptions/${subscription.id}/resources`;

          const matchedCustomer = customerData.find(cust => cust['Subscription Id'] === subscription.id);

          managedApplications.push({
            customerName: matchedCustomer ? matchedCustomer['CustomerName'] : 'Unknown',
            name: managedApp.name || 'N/A',
            installDate: matchedCustomer ? matchedCustomer['Install Date'] : 'N/A',
            subscriptionId: subscription.id,
            subscriptionName: subscription.name,
            resourceGroup: managedApp.id?.split('/')[4] || 'N/A',
            location: managedApp.location || 'N/A',
            url: vmUrl,
          });
        }
      } catch (error) {
        console.error(`Error while fetching Managed Applications for subscription ${subscription.id}:`, error);
      }

      processedSubscriptions++;
      const progressPercent = Math.round((processedSubscriptions / totalSubscriptions) * 100);
      progressBar.value = progressPercent;
      progressText.textContent = `Retrieving data... (${processedSubscriptions}/${totalSubscriptions} subscriptions processed)`;
    }

    progressContainer.style.display = 'none';
    document.getElementById('loading-message').style.display = 'none';
    updateTable(managedApplications);
    document.getElementById('total-applications-count').textContent = managedApplications.length;
  } catch (error) {
    if (signal.aborted) {
      console.log("Data retrieval was cancelled.");
    } else {
      console.error('Error during Azure login or fetching managed applications:', error);
    }
  }
}

function logout() {
  console.log("Logging out...");

  credential = null;
  tokenExpirationTime = null;

  document.getElementById('tenant-info').style.display = 'none';
  document.getElementById('login-button').style.display = 'block';
  document.getElementById('logout-button').style.display = 'none';
  document.getElementById('search-container').style.display = 'none';
  const progressContainer = document.getElementById('progress-container');
  progressContainer.style.display = 'none';
  const progressBar = document.getElementById('progress-bar');
  progressBar.value = 0;

  clearTable();
  document.getElementById('login-prompt').innerHTML = '';  
  document.getElementById('login-prompt').style.display = 'none';

  console.log("Logout successful, ready to login with another tenant.");
}

async function getSubscriptions(credential) {
  console.log("Attempting to retrieve subscriptions...");
  try {
    const subscriptionClient = new SubscriptionClient(credential);
    const subscriptions = [];
    for await (const sub of subscriptionClient.subscriptions.list()) {
      console.log(`Subscription found: ${sub.displayName} (${sub.subscriptionId})`);
      subscriptions.push({
        id: sub.subscriptionId,
        name: sub.displayName,
      });
    }
    return subscriptions;
  } catch (error) {
    console.error("Error while retrieving subscriptions:", error);
    return [];
  }
}

function updateTable(managedApps) {
  console.log("Updating table with Managed Applications...");
  const tableContainer = document.getElementById('table-container');
  tableContainer.style.display = 'block';

  if (!document.getElementById('managed-apps-table')) {
    let tableHtml = `
      <table id="managed-apps-table">
        <tr>
          <th>#</th>
          <th>Customer Name</th>
          <th>Managed Application Name</th>
          <th>Install Date</th>
          <th>Subscription Name</th>
          <th>Subscription ID</th>
          <th>Resource Group</th>
          <th>Location</th>
          <th>Actions</th>
        </tr>
    `;
    managedApps.forEach((app, index) => {
      tableHtml += `
        <tr>
          <td>${index + 1}</td>
          <td>${app.customerName}</td>
          <td>${app.name}</td>
          <td>${app.installDate}</td>
          <td>${app.subscriptionName}</td>
          <td>${app.subscriptionId}</td>
          <td>${app.resourceGroup}</td>
          <td>${app.location}</td>
          <td><button class="open-customer-btn" onclick="openCustomer('${app.url}')">Open Customer 🚀</button></td>
        </tr>
      `;
    });
    tableHtml += '</table>';
    tableContainer.innerHTML = tableHtml;
    document.getElementById('search-container').style.display = 'block';
  } else {
    const existingTable = document.getElementById('managed-apps-table');
    existingTable.innerHTML = `
      <tr>
        <th>#</th>
        <th>Customer Name</th>
        <th>Managed Application Name</th>
        <th>Kind</th>
        <th>Subscription Name</th>
        <th>Subscription ID</th>
        <th>Resource Group</th>
        <th>Location</th>
        <th>Actions</th>
      </tr>
    `;
    managedApps.forEach((app, index) => {
      const newRow = existingTable.insertRow(-1);
      newRow.innerHTML = `
        <td>${index + 1}</td>
        <td>${app.customerName}</td>
        <td>${app.name}</td>
        <td>${app.insa}</td>
        <td>${app.subscriptionName}</td>
        <td>${app.subscriptionId}</td>
        <td>${app.resourceGroup}</td>
        <td>${app.location}</td>
        <td><button class="open-customer-btn" onclick="openCustomer('${app.url}')">Open Customer 🚀</button></td>
      `;
    });
  }

  document.getElementById('total-applications-count').textContent = managedApps.length;
}

function showLoginPrompt(info) {
  const loginPromptContainer = document.getElementById('login-prompt');
  loginPromptContainer.innerHTML = `
    <h3>Device Login Required</h3>
    <p>Code copied to clipboard: <strong>${info.userCode}</strong></p>
    <p>Please <a href="https://microsoft.com/devicelogin" target="_blank">click here</a> to complete the login process and enter the code.</p>
  `;
  loginPromptContainer.style.display = 'block';
}

function cancelDataRetrieval() {
  if (abortController) {
    abortController.abort();
    console.log("Data retrieval cancellation requested.");
    clearTable();
  }
}

function clearTable() {
  console.log("Clearing the Managed Applications table.");
  const tableContainer = document.getElementById('table-container');
  tableContainer.innerHTML = '';
}

function openCustomer(url) {
  require('electron').shell.openExternal(url);
}

// Updated DOMContentLoaded section to ensure elements exist before adding event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Ensure that elements exist in the DOM before accessing them.
  const loginButton = document.getElementById('login-button');
  if (loginButton) {
    loginButton.addEventListener('click', loginToAzure);
  }
  
  const refreshButton = document.getElementById('refresh-button');
  if (refreshButton) {
    refreshButton.addEventListener('click', refreshManagedApplications);
  }

  const cancelButton = document.getElementById('cancel-button');
  if (cancelButton) {
    cancelButton.addEventListener('click', cancelDataRetrieval);
  }

  const logoutButton = document.getElementById('logout-button');
  if (logoutButton) {
    logoutButton.addEventListener('click', logout);
  }

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', filterApplications);
  }

  const saveCustomerListButton = document.getElementById('save-customer-list-button');
  if (saveCustomerListButton) {
    saveCustomerListButton.addEventListener('click', saveCustomerListURL);
  }

  // Load initial tenants and customer data
  loadTenantsDropdown();
  loadTenantList();
  loadCustomerData();
});

function filterApplications() {
  const searchInput = document.getElementById('search-input').value.toLowerCase();
  const table = document.getElementById('managed-apps-table');

  if (!table) return;

  const rows = table.getElementsByTagName('tr');
  if (searchInput.trim() === '') {
    for (let i = 1; i < rows.length; i++) {
      rows[i].style.display = '';
    }
    return;
  }

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].getElementsByTagName('td');
    let rowContainsSearchTerm = false;

    for (let j = 0; j < cells.length; j++) {
      if (cells[j].textContent.toLowerCase().includes(searchInput)) {
        rowContainsSearchTerm = true;
        break;
      }
    }

    rows[i].style.display = rowContainsSearchTerm ? '' : 'none';
  }
}

function saveCustomerListURL() {
  const newCustomerListURL = document.getElementById('customer-list-url').value;
  if (newCustomerListURL) {
    customerListURL = newCustomerListURL;
    localStorage.setItem('customerListURL', customerListURL);
    alert("Customer list URL saved successfully!");
  } else {
    alert("Please enter a valid customer list URL.");
  }
}

function formatUKDate(dateString) {
    if (!dateString) return 'N/A';
  
    const [year, month, day] = dateString.split('/');
    return `${day}/${month}/${year}`;
  }