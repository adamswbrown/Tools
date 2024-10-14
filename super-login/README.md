# Azure Managed Applications Viewer

This project is a tool for viewing and managing Azure Managed Applications across different tenants and quickly opening their Dr Migrate Instances. 

It includes features for:

- logging in to a tenant
- retrieving managed application data
- logging into Custoemrs Dr M Mananged Application RG

This README file contains installation instructions and usage guidelines for the tool.

## Prerequisites

- Node.js and npm must be installed on your system.
- Azure subscription credentials with permissions to view Managed Applications.
- Internet connection to access Azure and customer data.
- Git must be installed to clone this repository.

## Installation Instructions

1. **Clone the Repository**

   Open your terminal and run the following command to clone the repository:
   ```bash
   git clone <repository_url>
   cd <repository_folder>
   ```

2. **Install Dependencies**

   Navigate to the cloned repository and install the required dependencies using npm:
   ```bash
   npm install
   ``` 
   If any of the depednacies fail to install, install the following Node modules manually
   ```bash
   npm install @azure/identity @azure/arm-managedapplications @azure/arm-subscriptions electron xlsx
   ```

3. **Configure the Tool**

   Make sure to modify the following values in `renderer.js`:
   - Update the default `customerListURL` if you need to point to a different customer data file.
   - Add any additional tenants that you want to manage via the tool.

## Usage Instructions

### Running the Tool

To run the tool, use the following command in your terminal:
```bash
npm start
```
This command will open an Electron application that you can use to manage Azure Managed Applications.

> [!NOTE]
> There are no plans to package the tool until its finished development

### Features

- **Login to Azure Tenant:**
  - Select a tenant from the dropdown and click "Login to Azure Tenant". The tool will provide a device code that you need to enter at [https://microsoft.com/devicelogin](https://microsoft.com/devicelogin).

- **Retrieve Managed Applications:**
  - Once logged in, the tool will automatically retrieve the Managed Applications for the selected subscription and display them in a table. Use the "Refresh" button to get the latest data.

- **Search Applications:**
  - Use the search bar to filter Managed Applications by Customer Name, Subscription ID, or any other available field.

- **Start Customer Instances:**
  - Using the Open Customer button, a new browser instance will open (default browser), to the Resoruce Group that the Custoemr's instance is located, allowing you to easily use Azure Bastion the customers instance. 

- **Tenant Management:**
  - Under the "Admin" tab, you can add a new tenant by providing its ID and domain name.
  - Tenants can be deleted from the configured tenant list.
    - Currenrly Supports the **Lab3** and **Altra** tennants

- **Customer Data URL Management:**
  - Update the URL for the customer list data under the "Admin" tab to point to a new Excel file containing subscription information.

### Important Notes

- The tool requires an active Lab3 or Altra Azure credential to retrieve Managed Applications. Ensure that your Azure user has permissions for the specified subscriptions.
- The tool only pulls back customer data for Lab3 customers. - Altra customers will not return Customer Name or Install Date
- Error Logging for the tool is present in the Developer Console  (Opt + CMD + I, to open it, select Console), this will be fixed in a later version.

### TODO:

* Error Handling - Currently, all the error logs land in the Eletron Console, they should be visuable in the UI
* Build support for Salesforce customer data ingestion - currently only Lab3 customer data is returned from Blob storage. Need to look at using Salesforce to pull back up to date customer insrall data
* Add Feature: Deployment ID lookup - Provide functionalty to look up customers Deployment ID


