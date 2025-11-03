# 🚀 Quick Start Guide

## Ready to use the Alaska Airlines Mileage Plan Automation? Here's how:

### 📋 Step 1: Use the Excel Template
- Open `data/sample-template.xlsx` 
- This shows you the exact format needed
- Replace the sample data with your real users

### ⚙️ Step 2: Update the Configuration
- Make sure your `.env` file has the correct API credentials
- Double-check all API URLs are pointing to the right environment

### 🎯 Step 3: Run the Application
```bash
npm start
```

### 📊 Step 4: Check Your Results
- Reports are saved in the `data/` folder
- Open the CSV file to see SUCCESS/FAILED status for each user
- The JSON file has complete API response details

## 📁 Example Files Included:
- `sample-template.xlsx` - Clean template to start with
- `processing-results-2025-11-03T16-34-37-473Z.csv` - Example successful run showing 3 users enrolled with accruals and tiers

## 🎉 What Success Looks Like:
- Each user gets a unique Mileage Plan number
- All accruals (Net, EQM, Segments, Million Miles) are posted
- Tier promotions are completed (MVP → Atmos Silver, etc.)
- Detailed reports show SUCCESS for each operation

**Need help?** Check the full README.md for troubleshooting and advanced configuration options.