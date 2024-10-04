
# PowerShell Script: main.ps1

This PowerShell script automates the retrieval and merging of data from Salesforce, specifically deployment and asset records. After merging, it allows the user to select a customer from a grid view and proceed with actions based on the deployment type (SaaS or Marketplace). Below is an overview of the script and how to use it.

## Features

- Queries Salesforce data for deployments and assets using `sfdx force:data:soql:query`.
- Merges deployment and asset data based on `Subscription_ID__c`.
- Displays customer information in a grid view for user selection.
- Performs actions depending on the deployment type (`SaaS` or `Marketplace`):
  - SaaS: Opens a specified SaaS URL in Microsoft Edge and copies the customer name to the clipboard.
  - Marketplace: Opens the Azure portal for the customer's subscription and copies the Licence GUID to the clipboard.

## Script Flow

1. **Salesforce Queries**: 
   - The script queries Salesforce to retrieve deployment and asset data, saving them as CSV files.
   - The deployment and asset data are then imported into PowerShell variables.

2. **Merging Data**: 
   - The script matches deployment records with asset records based on the `Subscription_ID__c` field.
   - Missing data from deployment records is filled using the asset data when available.
   
3. **Customer Selection**: 
   - The merged customer data is displayed in a grid view where the user can select a customer.
   - Depending on the deployment type (`SaaS` or `Marketplace`), different actions are triggered.
   
4. **Actions**: 
   - For SaaS deployments, the script copies the customer name to the clipboard and opens a SaaS admin URL in Microsoft Edge.
   - For Marketplace deployments, it copies the Licence GUID to the clipboard and opens the Azure portal for the customer's subscription.

## Prerequisites

Ensure the following are set up on your system:
- PowerShell 7.0 or later
- Salesforce CLI (`sfdx`) installed and authenticated with the correct org - speak to John Theodorikakos -john.theodorikakos@altra.cloud for access
  - To download and install Salesforce CLI, go to https://developer.salesforce.com/tools/salesforcecli, and follow the instructions.
  - To authenticate your org by using the web server flow, run this command:
- Microsoft Edge browser
  - You'll need to configure your Edge Profile:
      # Navigate to the profiles directory
        cd ~/Library/Application\ Support/Microsoft\ Edge
        # List out the profile directories. Note that the directory name is what is used in the launch command, *not* necessarily the friendly name of the profile you see in Microsoft Edge.app
        find ./ -type f -name Preferences

- CSV files are saved in the correct paths as specified in the script.

## How to Run

1. Clone this repository and navigate to the script's directory.
2. Run the script using PowerShell:
   ```powershell
   ./main.ps1
   ```
3. Follow the prompts in the script to interact with customer records.

