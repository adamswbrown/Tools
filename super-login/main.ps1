# Start an infinite loop to keep returning to the customer selection screen
while ($true) {
    # Paths to save the CSV files
    $tempExcelPath = Join-Path -Path $HOME/Developer/super-login -ChildPath "DrMigrateLiveSubscriptions.csv"
    $tempCsvPath = Join-Path -Path $HOME/Developer/super-login -ChildPath "AssetData.csv"

    # Run the first Salesforce query (deployment data)
    sfdx force:data:soql:query -o 'Altra' --query "SELECT Subscription_ID__c, Assessed_Machines__c, Asset__c, CreatedById, Current_Licence__c, Customer_Name__c, Deployment_Date__c, Name, Deployment_Status__c, Deployment_Type__c, Discovered_Machines__c, Install_Date__c, LastModifiedById, Last_Updated__c, Licence_GUID__c, Managed_App_Location__c, OwnerId, Provisioning_Status__c, Renewal_Date__c, Renewal_Licence__c FROM Deployment__c" -r csv | ConvertFrom-CSV | Export-Csv $tempExcelPath

    # Run the second Salesforce query (asset data)
    sfdx force:data:soql:query -o 'Altra' --query "SELECT Account_Text__c, Hosting__c, Subscription_ID__c, Type__c, Asset_GUID__c FROM Asset" -r csv | ConvertFrom-CSV | Export-Csv -Path $tempCsvPath -NoTypeInformation

    # Read both CSV files into variables
    $deploymentData = Import-Csv -Path $tempExcelPath
    $assetData = Import-Csv -Path $tempCsvPath

    # Initialize an array to store the merged records
    $mergedContent = @()

    foreach ($deploymentRecord in $deploymentData) {
        # Find matching asset data by Subscription_ID__c
        $matchingAssetRecord = $assetData | Where-Object { $_.Subscription_ID__c -eq $deploymentRecord.Subscription_ID__c }

        # Merge data where there is a gap in the deployment data
        $subscriptionId = if ($deploymentRecord.Subscription_ID__c) { $deploymentRecord.Subscription_ID__c } else { $matchingAssetRecord.Subscription_ID__c }
        $licenceGuid = if ($deploymentRecord.Licence_GUID__c) { $deploymentRecord.Licence_GUID__c } else { $matchingAssetRecord.Licence_GUID__c }
        
        # Merge Customer Name from deployment and asset data
        $customerNameDeployment = if ($deploymentRecord.Customer_Name__c) { $deploymentRecord.Customer_Name__c } else { "" }
        $customerNameAsset = if ($matchingAssetRecord.Account_Text__c) { $matchingAssetRecord.Account_Text__c } else { "" }
        $customerName = if ($customerNameDeployment -and $customerNameAsset) { "$customerNameDeployment / $customerNameAsset" } elseif ($customerNameDeployment) { $customerNameDeployment } elseif ($customerNameAsset) { $customerNameAsset } else { "Not available" }

        $deploymentType = if ($deploymentRecord.Deployment_Type__c) { $deploymentRecord.Deployment_Type__c } else { "Not available" }

        # Format date fields
        $renewDateFormatted = if ($deploymentRecord.Renewal_Date__c) { (Get-Date $deploymentRecord.Renewal_Date__c -Format "dd/MM/yyyy") } else { "" }
        $LicenceExpiryFormatted = if ($deploymentRecord.LicenceExpiry) { (Get-Date $deploymentRecord.LicenceExpiry -Format "dd/MM/yyyy") } else { "" }
        $DeploymentDateFormatted = if ($deploymentRecord.Deployment_Date__c) { (Get-Date $deploymentRecord.Deployment_Date__c -Format "dd/MM/yyyy") } else { "" }
        $InstallDateFormatted = if ($deploymentRecord.Install_Date__c) { (Get-Date $deploymentRecord.Install_Date__c -Format "dd/MM/yyyy") } else { "" }
        $LastUpdatedDateFormatted = if ($deploymentRecord.Last_Updated__c) { (Get-Date $deploymentRecord.Last_Updated__c -Format "dd/MM/yyyy") } else { "" }

        # Create a custom object with the merged data
        $mergedRecord = [PSCustomObject]@{
            Customer_Name__c         = $customerName
            Subscription_ID__c       = $subscriptionId
            Licence_GUID__c          = $licenceGuid
            Deployment_Type__c       = $deploymentType
            Managed_App_Location__c  = $deploymentRecord.Managed_App_Location__c
            Discovered_Machines__c   = $deploymentRecord.Discovered_Machines__c
            Renewal_Date__c          = $renewDateFormatted
            Licence_expity           = $LicenceExpiryFormatted
            Current_Licence__c       = $deploymentRecord.Current_Licence__c
            Install_Date__c          = $InstallDateFormatted
            Deployment_Date_c        = $DeploymentDateFormatted
            Renewal_Licence__c       = $deploymentRecord.Renewal_Licence__c
            Last_Updated__c          = $LastUpdatedDateFormatted
        }

        # Add the merged record to the array
        $mergedContent += $mergedRecord
    }

    # Sort the content: "Marketplace" instances at the top, then by whether Discovered_Machines__c is 0
    $sortedContent = $mergedContent | Sort-Object { $_.Deployment_Type__c -ne "Marketplace" }, { $_.Discovered_Machines__c -eq 0 }, Customer_Name__c

    # Display the sorted customer records in the grid view
    $selectedCustomer = $sortedContent | Select-Object -Property Customer_Name__c, Subscription_ID__c, Licence_GUID__c, Deployment_Type__c, Managed_App_Location__c, Discovered_Machines__c, Renewal_Date__c, Current_Licence__c, Install_Date__c, Renewal_Licence__c, Last_Updated__c | Out-ConsoleGridView -Title "Select Customer" -OutputMode Single
    
    # If the user cancels the selection, return to the beginning of the loop
    if (-not $selectedCustomer) {
        continue
    }

    # Retrieve the selected customer details
    $deploymentType = $selectedCustomer.Deployment_Type__c
    $customerName = $selectedCustomer.Customer_Name__c
    $subscriptionId = if ($selectedCustomer.Subscription_ID__c) { $selectedCustomer.Subscription_ID__c } else { "Not available" }
    $licenceGuid = if ($selectedCustomer.Licence_GUID__c) { $selectedCustomer.Licence_GUID__c } else { "Not available" }

    # Output the Subscription ID and Licence GUID
    Write-Host "Subscription ID: $subscriptionId" -ForegroundColor Yellow
    Write-Host "Licence GUID: $licenceGuid" -ForegroundColor Yellow

    if ($deploymentType -eq "SaaS") {
        # Copy the customer name to the clipboard
        Set-Clipboard -Value $customerName

        # Construct the SaaS URL
        $saasUrl = "https://express.drmigrate.com/Admin/Customers"

        # Open the SaaS URL in Microsoft Edge
        Start-Process -FilePath "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" -ArgumentList "--profile-directory=`"Profile 6`" $saasUrl"

        # Inform the user that the customer name has been copied to the clipboard
        Write-Host "Customer name '$customerName' copied to clipboard and opening SaaS URL: $saasUrl"
    } elseif ($deploymentType -eq "Marketplace") {
        # Copy the Licence GUID to the clipboard
        Set-Clipboard -Value $licenceGuid

        # Inform the user that the Licence GUID has been copied to the clipboard
        Write-Host "Licence GUID '$licenceGuid' copied to clipboard."

        # Construct the Azure URL
        $tenantDomain = "lab3.com.au"
        $vmUrl = "https://portal.azure.com/#@$tenantDomain/resource/subscriptions/$subscriptionId/resources"

        # Open the Azure URL in Microsoft Edge
        Start-Process -FilePath "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" -ArgumentList "--profile-directory=`"Profile 6`" $vmUrl"
           
        # Inform the user that the Azure portal is opening
        Write-Host "Opening Azure portal URL: $vmUrl"
    } else {
        Write-Host "Bubbles" -ForegroundColor Yellow
    }

    # Wait for user to proceed before returning to customer selection
    Read-Host -Prompt "Press Enter to return to customer selection"
}
