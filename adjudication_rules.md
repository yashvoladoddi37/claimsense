# OPD Claim Adjudication Rules

## Overview
This document outlines the rules and logic for adjudicating (approving/rejecting) OPD insurance claims. The system should evaluate claims based on these rules in the specified order.

## Adjudication Flow

### Step 1: Basic Eligibility Check
- **Policy Status**: Policy must be active on the date of treatment
- **Waiting Period**: Check if waiting periods have been satisfied
- **Member Verification**: Claimant must be a covered member (employee/dependent)

### Step 2: Document Validation
All submitted documents must meet these criteria:
- **Legibility**: Documents must be clear and readable
- **Completeness**: All required fields must be visible
- **Authenticity**: 
  - Doctor's registration number must be valid (format: [State Code]/[Number]/[Year])
  - Hospital/Clinic registration must be verifiable
  - Bills must have proper headers and stamps
- **Date Consistency**: All documents must have matching treatment dates
- **Patient Details**: Name and age must match policy records (minor variations acceptable)

### Step 3: Coverage Verification
Check if the treatment/service is covered:
- Compare against covered services list
- Verify it's not in exclusions list
- Check for pre-authorization requirements

### Step 4: Limit Validation
Verify claim amount against applicable limits:
1. **Annual Limit**: Total claims YTD + current claim ≤ Annual limit
2. **Sub-limits**: Category-specific limits (consultation, pharmacy, etc.)
3. **Per-claim Limit**: Single claim cannot exceed per-claim limit
4. **Co-payment Calculation**: Apply co-pay percentages where applicable

### Step 5: Medical Necessity Review
Evaluate if treatment was medically necessary:
- Diagnosis must justify the treatment
- Prescription must align with diagnosis
- Test results must support the diagnosis (if applicable)
- Treatment must follow standard medical protocols

## Approval Conditions
A claim is **APPROVED** when ALL of the following are true:
- ✅ Policy is active and waiting period satisfied
- ✅ All required documents are submitted and valid
- ✅ Treatment is covered under policy
- ✅ Claim amount is within limits (after co-pay)
- ✅ Medical necessity is established
- ✅ No fraud indicators detected

## Rejection Reasons
A claim is **REJECTED** if ANY of the following apply:

### Category 1: Eligibility Issues
- `POLICY_INACTIVE`: Policy not active on treatment date
- `WAITING_PERIOD`: Treatment during waiting period
- `MEMBER_NOT_COVERED`: Claimant not found in policy records

### Category 2: Documentation Issues
- `MISSING_DOCUMENTS`: Required documents not submitted
- `ILLEGIBLE_DOCUMENTS`: Documents not readable
- `INVALID_PRESCRIPTION`: Prescription missing or invalid
- `DOCTOR_REG_INVALID`: Doctor registration number invalid/missing
- `DATE_MISMATCH`: Document dates don't match
- `PATIENT_MISMATCH`: Patient details don't match records

### Category 3: Coverage Issues
- `SERVICE_NOT_COVERED`: Treatment/service not covered
- `EXCLUDED_CONDITION`: Condition in exclusions list
- `PRE_AUTH_MISSING`: Pre-authorization required but not obtained

### Category 4: Limit Issues
- `ANNUAL_LIMIT_EXCEEDED`: Annual limit exhausted
- `SUB_LIMIT_EXCEEDED`: Category sub-limit exceeded
- `PER_CLAIM_EXCEEDED`: Single claim limit exceeded

### Category 5: Medical Issues
- `NOT_MEDICALLY_NECESSARY`: Treatment not justified by diagnosis
- `EXPERIMENTAL_TREATMENT`: Experimental/unproven treatment
- `COSMETIC_PROCEDURE`: Cosmetic/aesthetic procedure

### Category 6: Process Issues
- `LATE_SUBMISSION`: Submitted after 30-day deadline
- `DUPLICATE_CLAIM`: Same treatment already claimed
- `BELOW_MIN_AMOUNT`: Claim below ₹500 minimum

## Special Scenarios

### 1. Partial Approval
Claims can be partially approved when:
- Part of the treatment is covered, part is not
- Claim exceeds limits (approve up to limit)
- Co-payment applies

### 2. Refer for Manual Review
Send for human review when:
- Fraud indicators detected (unusual patterns, modified documents)
- High-value claims (>₹25,000)
- Complex medical conditions
- System confidence <70%
- Member appeals automated decision

### 3. Network vs Non-Network
- **Network providers**: Apply network discounts, cashless possible
- **Non-network**: Full payment by member, standard reimbursement

## Fraud Indicators
Watch for these red flags:
- Multiple claims from same provider on same day
- Unusually high frequency of claims
- Bills with suspicious alterations
- Diagnosis not matching age/gender
- Duplicate bills across different dates
- Provider not registered/blacklisted

## Decision Output Format
Every decision should include:
```json
{
  "claim_id": "CLM_XXXXX",
  "decision": "APPROVED/REJECTED/PARTIAL/MANUAL_REVIEW",
  "approved_amount": 0000,
  "rejection_reasons": [],
  "confidence_score": 0.95,
  "notes": "Additional observations",
  "next_steps": "What the claimant should do"
}
```

## Priority Rules
When multiple rules conflict:
1. Safety first (reject suspicious/fraudulent claims)
2. Policy exclusions override everything
3. Hard limits cannot be exceeded
4. Medical necessity is mandatory
5. When in doubt, refer for manual review