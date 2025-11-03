# Alaska Airlines Mileage Plan Automation

A comprehensive Node.js application that automates Alaska Airlines Mileage Plan enrollment, accruals, and tier updates by reading data from Excel files.

## 🚀 Features

- **Complete Enrollment Pipeline**: Automated user enrollment with Mileage Plan number extraction
- **Accrual Processing**: Automatic posting of Net miles, EQM, Segments, and Million Miles
- **Tier Management**: Automated tier updates (MVP, MVP Gold, MVP Gold 75K)
- **Excel Integration**: Simple Excel file input with flexible column mapping
- **Comprehensive Reporting**: Detailed SUCCESS/FAILED status for each operation
- **Error Handling**: Robust retry logic and detailed error reporting
- **Unique External Codes**: Guaranteed unique accrual transaction codes

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm package manager
- Alaska Airlines API access credentials

## 🛠️ Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
copy .env.example .env
```
Edit the `.env` file with your Alaska Airlines API credentials.

### 3. Prepare Your Excel File
- Use the provided template: `data/sample-template.xlsx`
- Place your Excel file in the `data/` directory
- Ensure all required columns are present (see Excel Format section)

## 📊 Excel Format

### Required Columns (User Information)
| Column Name | Description | Example | Required |
|-------------|-------------|---------|----------|
| `First Name` | User's first name | John | ✅ |
| `Last Name` | User's last name | Smith | ✅ |
| `Email` | Email address | john.smith@example.com | ✅ |
| `Phone` | Phone number | 555-0101 | ✅ |
| `Address` | Street address | 123 Main St | ✅ |
| `City` | City | Seattle | ✅ |
| `State` | State/Province | WA | ✅ |
| `Zip` | Zip/Postal code | 98101 | ✅ |
| `Country` | Country code | US | ✅ |
| `Date of Birth` | Birth date (YYYY-MM-DD) | 1990-05-15 | ✅ |
| `Gender` | Gender (M/F) | M | ✅ |

### Optional Columns (Accruals & Tiers)
| Column Name | Description | Example | Required |
|-------------|-------------|---------|----------|
| `Net` | Net miles to award | 2000 | ⭕ Optional |
| `EQM` | Elite Qualifying Miles | 1000 | ⭕ Optional |
| `Segments` | Flight segments | 10 | ⭕ Optional |
| `MillionMiles` | Million Mile credits | 1.0 | ⭕ Optional |
| `Tier` | Target tier level | MVP | ⭕ Optional |
| `TierActiveFrom` | Tier effective date | 2024-11-01 | ⭕ Optional |

### Tier Values
- `MVP` → Atmos Silver
- `MVP_GOLD` → Atmos Gold  
- `MVP_GOLD_75K` → Atmos Platinum

## 🎯 How to Use

### Step 1: Create Your Excel File
1. **Use the Template**: Copy `data/sample-template.xlsx` as your starting point
2. **Fill in User Data**: Add your users' information to each row
3. **Add Accruals (Optional)**: Include Net, EQM, Segments, MillionMiles if needed
4. **Add Tiers (Optional)**: Include Tier and TierActiveFrom if promoting users
5. **Save the File**: Save in the `data/` directory with any name ending in `.xlsx`

### Step 2: Update the File Path
Edit `index.js` to point to your Excel file:
```javascript
// Change this line (around line 152) to match your Excel filename:
const excelFilePath = './data/your-excel-file.xlsx';
```

### Step 3: Run the Application
```bash
npm start
```

## 📊 Understanding the Reports

The application generates detailed reports in the `data/` folder:

### CSV Report (`processing-results-YYYY-MM-DDTHH-MM-SS-sssZ.csv`)
```csv
Row,FirstName,LastName,Email,Enrollment_Status,MP_Number,Net_Status,Net_Value,EQM_Status,EQM_Value,Segments_Status,Segments_Value,MillionMiles_Status,MillionMiles_Value,Tier_Status,Tier_Value,Tier_Level,Errors
1,JOHN,SMITH,john.smith@example.com,SUCCESS,457853653,SUCCESS,2000,SUCCESS,1000,SUCCESS,10,SUCCESS,1.0,SUCCESS,MVP,Atmos Silver,
```

### JSON Report (`processing-results-YYYY-MM-DDTHH-MM-SS-sssZ.json`)
Contains complete API responses and detailed error information for troubleshooting.

### Console Output
Real-time progress with:
- ✅ Success indicators
- 🎯 Mileage Plan numbers as they're assigned
- 💰 Accrual processing status
- 👑 Tier update confirmations
- 📊 Final summary statistics

## 🔧 Configuration

### Environment Variables (.env)
```bash
# Alaska Airlines OAuth
TOKEN_API_URL=https://apis.qa.alaskaair.com/oauth2/token
BASIC_AUTH_TOKEN=your_base64_encoded_credentials

# Enrollment API
ENROLLMENT_API_URL=https://apis.qa.alaskaair.com/mileageplan/v1.0.0/enrollments
OCP_APIM_SUBSCRIPTION_KEY=your_subscription_key

# Accrual API
ACCRUAL_API_URL=https://apis.qa.alaskaair.com/mileageplan/lps/v1.0.0/accrual

# Tier API
TIER_API_URL=https://apis.qa.alaskaair.com/mileageplan/lps/v1.0.0/updateTier

# Accrual Codes
NET_ACCRUAL_CODE=SSHAN
EQM_ACCRUAL_CODE=SSHA5
SEGMENTS_ACCRUAL_CODE=SSHAS
MILLION_MILES_ACCRUAL_CODE=SSHAL
```

## 🚨 Troubleshooting

### Common Issues

**1. "Excel file not found"**
```bash
# Solution: Check the file path in index.js matches your Excel file
const excelFilePath = './data/your-actual-filename.xlsx';
```

**2. "Column not found in Excel"**
```bash
# Solution: Ensure your Excel has all required columns with exact names
# Use the sample-template.xlsx as a reference
```

**3. "Identity Already Exists" Error**
```bash
# Solution: Use unique email addresses and usernames
# The system prevents duplicate enrollments
```

**4. "MP Number Not Found"**
```bash
# Solution: This happens with existing users
# Use completely unique user identities for testing
```

### API Response Codes
- **200**: Success
- **400**: Bad Request (check payload format)
- **401**: Unauthorized (check credentials)
- **409**: Conflict (user already exists)
- **500**: Server Error (retry later)

## 📁 Project Structure

```
├── data/                          # Excel files and reports
│   ├── sample-template.xlsx       # Excel template
│   └── processing-results-*.csv   # Generated reports
├── index.js                       # Main application
├── SimpleReportGenerator.js       # Report generation
├── package.json                   # Dependencies
├── .env                          # Configuration
└── README.md                     # This file
```

## 🎯 Example Workflow

1. **Prepare Excel**: Fill `data/sample-template.xlsx` with 3 users
2. **Run Application**: `npm start`
3. **Watch Progress**: See real-time enrollment and accrual processing
4. **Check Results**: Open the generated CSV report
5. **Verify**: Confirm all users got Mileage Plan numbers and desired accruals/tiers

## 🔄 Process Flow

```
Excel File → User Enrollment → MP Number → Accruals → Tier Updates → Reports
     ↓              ↓              ↓          ↓           ↓          ↓
  Read Data    → Get Token   → Extract MP# → Post Miles → Set Tier → Save CSV
```

## 🎉 Success Indicators

- ✅ **Enrollment Success**: User gets assigned a Mileage Plan number
- 💰 **Accrual Success**: All specified miles/segments are posted
- 👑 **Tier Success**: User is promoted to the specified tier level
- 📊 **Report Generated**: Detailed CSV and JSON reports created

## 🛡️ Best Practices

1. **Test with Small Batches**: Start with 2-3 users to verify setup
2. **Use Unique Identities**: Avoid duplicate emails/usernames
3. **Validate Dates**: Use YYYY-MM-DD format for all dates
4. **Check Credentials**: Ensure .env file has valid API keys
5. **Review Reports**: Always check the generated reports for errors

---

**Ready to get started?** Copy `data/sample-template.xlsx`, add your users, and run `npm start`! 🚀