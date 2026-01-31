# MedLedger Testing Guide

This guide provides comprehensive instructions for testing the encrypted prescription system.

## Prerequisites

Ensure all services are running:

```bash
# Terminal 1: Blockchain (Foundry Anvil)
cd /home/shash/btp/contracts && anvil

# Terminal 2: Backend API
cd /home/shash/btp/server && npm start

# Terminal 3: Frontend
cd /home/shash/btp/web && npm run dev
```

## Test Wallets

Anvil provides pre-funded test accounts:

- **Doctor 1**: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- **Doctor 2**: `0x3C44CdDdB6a900fa2b585dd299e03d12fa4293BC`
- **Patient 1**: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- **Patient 2**: `0x90F79bf6EB2c4f870365E785982E1f101E93b906`

## Test Scenarios

### Scenario 1: Basic Encrypted Prescription Flow

**Objective**: Create and decrypt an encrypted prescription

**Steps**:

1. **Connect as Doctor 1**
   - Open http://localhost:5173
   - Click "Connect Wallet"
   - Select account `0x7099...79C8` (Doctor 1)
   - Verify "Connected: Doctor" badge appears

2. **Create Encrypted Prescription**
   - Fill in form:
     - Patient Address: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
     - Title: "Test Prescription 1"
     - Summary: "Antibiotics for infection"
     - Notes: "Take with food"
     - Medications:
       - Name: Amoxicillin
       - Dosage: 500mg
       - Schedule: Three times daily
   - Click "Submit Prescription Request"
   - **Verify**: Two signature prompts appear
     1. First: EIP-712 encryption key derivation
     2. Second: Prescription signature
   - **Verify**: Success message: "Prescription request submitted"

3. **Switch to Patient Wallet**
   - Disconnect wallet
   - Connect as Patient 1 (`0xf39F...2266`)
   - **Verify**: "Connected: Patient" badge appears

4. **View and Decrypt Draft**
   - Scroll to "Pending Prescription Drafts"
   - **Verify**: One draft shows "🔒 Encrypted Prescription"
   - Click gradient "Decrypt to View" button
   - **Verify**: Loading spinner appears
   - **Verify**: Decrypted content shows in green gradient card:
     - Title: "Test Prescription 1"
     - Summary: "Antibiotics for infection"
     - Notes: "Take with food"
     - Medications list with bullet point

5. **Co-Sign Prescription**
   - Click "Sign & Publish" button
   - Approve wallet signature
   - **Verify**: Success message: "Prescription published on-chain"
   - **Verify**: Draft moves to "Published Prescriptions" section

6. **View Published Prescription**
   - Scroll to "Published Prescriptions"
   - **Verify**: Prescription shows "🔒 Encrypted Prescription"
   - Click "Decrypt to View"
   - **Verify**: Decrypted content shows in blue gradient card

**Expected Results**:
- ✅ Only 2 signature prompts (not 3+)
- ✅ Decryption works in both sections
- ✅ UI shows gradient buttons and colored cards
- ✅ No errors in browser console

---

### Scenario 2: Delegate Access & Re-encryption

**Objective**: Grant delegate access and verify automatic re-encryption

**Setup**: Complete Scenario 1 first

**Steps**:

1. **Doctor 2 Requests Access**
   - Disconnect wallet
   - Connect as Doctor 2 (`0x3C44...93BC`)
   - Go to "Request Access" section
   - Fill in:
     - Patient Address: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
     - Reason: "Covering for Dr. Smith during vacation"
   - Click "Send Access Request"
   - **Verify**: Success message

2. **Patient Approves Access**
   - Disconnect wallet
   - Connect as Patient 1
   - Scroll to "Pending Access Requests"
   - **Verify**: One request from Doctor 2
   - Click "Approve & Re-encrypt"
   - Approve transaction signature
   - **Verify**: Progress indicator appears: "Re-encrypting prescriptions... 1/1"
   - **Verify**: Success message: "Successfully re-encrypted 1 prescription"
   - **Verify**: Request moves to "Active Delegate Access" section

3. **Doctor 2 Views Patient Prescriptions**
   - Disconnect wallet
   - Connect as Doctor 2
   - Go to "View Patient Prescriptions" section
   - Enter Patient Address: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
   - Click "Load Prescriptions"
   - **Verify**: Prescription appears with "🔒 Encrypted Prescription"
   - Click "Decrypt to View"
   - **Verify**: Decryption succeeds (purple gradient card)
   - **Verify**: Content matches original prescription

**Expected Results**:
- ✅ Re-encryption progress shows correctly
- ✅ Delegate can decrypt after re-encryption
- ✅ No signature prompts for address-based key derivation
- ✅ Content integrity preserved

---

### Scenario 3: Batch Decryption

**Objective**: Test "Decrypt All" functionality

**Setup**: Create 3+ encrypted prescriptions

**Steps**:

1. **Create Multiple Prescriptions**
   - Connect as Doctor 1
   - Create 3 prescriptions with different patients
   - Use Patient 1 for all prescriptions

2. **Connect as Patient**
   - Switch to Patient 1 wallet
   - Go to "Pending Prescription Drafts"
   - **Verify**: 3 encrypted prescriptions shown

3. **Test Decrypt All**
   - Click "Decrypt All" button (purple text, top right)
   - **Verify**: Button shows "Decrypting..."
   - **Verify**: All 3 prescriptions decrypt sequentially
   - **Verify**: All show decrypted content in green gradient cards

4. **Test in Published Section**
   - Co-sign all 3 prescriptions
   - Go to "Published Prescriptions"
   - Refresh page to clear cache
   - **Verify**: 3 encrypted prescriptions shown
   - Click "Decrypt All"
   - **Verify**: Batch decryption works

**Expected Results**:
- ✅ Decrypt All button appears when 1+ encrypted items present
- ✅ Button disabled during decryption
- ✅ All items decrypt successfully
- ✅ Feedback message if any fail

---

### Scenario 4: Error Handling

**Objective**: Test error scenarios and recovery

#### 4.1 IPFS Gateway Timeout

**Steps**:
1. Disconnect internet temporarily
2. Try to decrypt a prescription
3. **Verify**: Retry logic activates (check console)
4. **Verify**: After 3 retries, error message appears
5. Reconnect internet
6. Click decrypt again
7. **Verify**: Works after reconnection

#### 4.2 Unauthorized Decryption Attempt

**Steps**:
1. Create prescription for Patient 1
2. Connect as Patient 2 (different patient)
3. Try to view Patient 1's prescriptions
4. **Verify**: Decryption fails with clear error message

#### 4.3 Partial Re-encryption Failure

**Steps**:
1. Create 5 prescriptions
2. Approve delegate access
3. Cancel 2 wallet signatures during re-encryption
4. **Verify**: Progress shows "Re-encrypted 3/5"
5. **Verify**: Warning message shows failure categories
6. **Verify**: Console logs detailed failure info

**Expected Results**:
- ✅ Clear error messages for all scenarios
- ✅ System recovers gracefully
- ✅ Partial failures don't break the app
- ✅ Retry logic works for transient errors

---

### Scenario 5: UI/UX Validation

**Objective**: Verify visual design and interactions

**Checklist**:

**Decrypt Button**:
- ✅ Gradient background (indigo to purple)
- ✅ Lock icon visible
- ✅ Hover effect: button lifts slightly
- ✅ Loading state: animated spinner
- ✅ Disabled state: reduced opacity, different cursor

**Decrypted Content Cards**:
- ✅ Green gradient for pending drafts
- ✅ Blue gradient for published prescriptions
- ✅ Purple gradient for patient records
- ✅ Check icon visible
- ✅ Structured layout: title bold, summary, notes, medications

**Decrypt All Button**:
- ✅ Purple text color
- ✅ Appears only when encrypted items present
- ✅ Positioned in top-right corner
- ✅ Shows "Decrypting..." during batch operation

**Re-encryption Progress**:
- ✅ Progress indicator visible during re-encryption
- ✅ Shows "X/Y" format
- ✅ Success message shows count
- ✅ Warning message shows failure details

---

## Performance Testing

### Large Dataset Test

**Objective**: Test with 20+ prescriptions

**Steps**:
1. Create script to generate 20 prescriptions
2. Approve delegate access
3. Measure re-encryption time
4. Test batch decryption performance
5. **Target**: < 5 seconds per prescription for re-encryption
6. **Target**: < 2 seconds per prescription for decryption

### Metrics to Monitor

Check browser console for performance logs:
- `encryption_ms`: Encryption time
- `decryption_ms`: Decryption time
- `reencryption_ms`: Total re-encryption time
- `reencryption_count`: Number of prescriptions re-encrypted
- `gas_prescribe`: Gas used for prescription creation
- `gas_finalize`: Gas used for co-signing
- `gas_delegate`: Gas used for granting access

---

## Common Issues & Solutions

### Issue: "User rejected signature"
**Cause**: User cancelled MetaMask prompt
**Solution**: Retry the operation

### Issue: "IPFS fetch failed after 3 attempts"
**Cause**: IPFS gateway timeout or network issue
**Solution**: 
- Check internet connection
- Verify Pinata gateway is accessible
- Wait and retry

### Issue: "Not authorized to decrypt"
**Cause**: Wallet not in recipients list
**Solution**: 
- Verify correct wallet connected
- Check if delegate access granted
- Ensure prescription created for correct patient

### Issue: "Invalid bundle structure"
**Cause**: Corrupted IPFS data or old format
**Solution**:
- Check backend logs for IPFS errors
- Verify bundle has all required fields
- May need to recreate prescription

### Issue: Decryption shows empty content
**Cause**: Field name mismatch or decryption failure
**Solution**:
- Check browser console for errors
- Verify bundle structure with developer tools
- Report bug if reproducible

---

## Debugging Commands

### Check Running Services
```bash
ps aux | grep -E "anvil|node.*server|vite"
```

### View Backend Logs
```bash
tail -f /home/shash/btp/server/logs/*.log
```

### Check Stored Requests
```bash
cat /home/shash/btp/server/data/requests.json | jq '.'
```

### Inspect Encrypted Bundle
```bash
cat /home/shash/btp/server/data/requests.json | jq '.[0].payload'
```

### Check Recipients
```bash
cat /home/shash/btp/server/data/requests.json | jq '.[0].payload.recipients | keys'
```

### Clear Test Data
```bash
echo '[]' > /home/shash/btp/server/data/requests.json
```

### Run Contract Tests
```bash
cd /home/shash/btp/contracts && forge test -vv
```

---

## Test Checklist

Use this checklist to verify all functionality:

### Core Features
- [ ] Doctor can create encrypted prescription
- [ ] Only 2 signature prompts (not 3+)
- [ ] Patient can decrypt pending drafts
- [ ] Patient can co-sign and publish
- [ ] Published prescriptions remain encrypted
- [ ] Patient can decrypt published prescriptions

### Delegate Access
- [ ] Doctor can request access
- [ ] Patient can approve access request
- [ ] Re-encryption progress indicator works
- [ ] Delegate can decrypt after re-encryption
- [ ] Re-encryption handles partial failures gracefully

### UI/UX
- [ ] Gradient decrypt buttons appear
- [ ] Loading spinners work
- [ ] Decrypted content shows in colored cards
- [ ] "Decrypt All" button appears and works
- [ ] Error messages are clear and helpful

### Error Handling
- [ ] IPFS retry logic works
- [ ] Unauthorized access blocked
- [ ] Partial re-encryption failures handled
- [ ] Network errors handled gracefully

### Performance
- [ ] Encryption < 2 seconds
- [ ] Decryption < 2 seconds
- [ ] Re-encryption < 5 seconds per prescription
- [ ] Batch decryption performs well

---

## Reporting Issues

When reporting issues, include:

1. **Scenario**: Which test scenario
2. **Steps**: Exact steps to reproduce
3. **Expected**: What should happen
4. **Actual**: What actually happened
5. **Console logs**: Browser console errors
6. **Network logs**: Failed API calls
7. **Wallet**: Which test account used
8. **Timestamp**: When issue occurred

Example bug report:
```
Scenario: Delegate Access (Scenario 2)
Steps:
1. Doctor 2 requested access
2. Patient 1 approved
3. Re-encryption started

Expected: All 3 prescriptions re-encrypted
Actual: Only 1 of 3 re-encrypted, error: "IPFS fetch failed"

Console: 
- Error: IPFS fetch failed after 3 attempts: Network timeout
- Failed prescription IDs: 2, 3

Wallet: Patient 1 (0xf39F...2266)
Timestamp: 2026-01-31 15:45:23
```

---

## Next Steps After Testing

Once all tests pass:

1. **Production Preparation**:
   - Review security audit checklist
   - Test with real Pinata API keys
   - Deploy to testnet (Sepolia/Goerli)

2. **User Acceptance Testing**:
   - Invite beta testers
   - Gather feedback on UX
   - Iterate based on feedback

3. **Documentation**:
   - Update user guide
   - Create video tutorials
   - Write deployment guide

4. **Monitoring**:
   - Set up error tracking (Sentry)
   - Monitor IPFS gateway uptime
   - Track gas costs

---

## Success Criteria

The system is ready for production when:

- ✅ All test scenarios pass 100%
- ✅ No errors in browser console
- ✅ Performance metrics meet targets
- ✅ Error messages are user-friendly
- ✅ UI is responsive and intuitive
- ✅ Re-encryption success rate > 95%
- ✅ IPFS retry logic works reliably
- ✅ Delegate access works end-to-end

**Current Status**: ✅ Ready for comprehensive testing

All features implemented. Focus now on running through all test scenarios and documenting any issues found.
