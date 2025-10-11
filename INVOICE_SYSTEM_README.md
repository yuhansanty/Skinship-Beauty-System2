# Invoice Management System for Skinship Beauty POS

A comprehensive invoice management system with Firebase integration for your beauty salon POS system.

## Features

### ✅ Automatic Invoice Generation
- **Sequential Invoice Numbers**: Auto-generates unique invoice numbers (IV-001, IV-002, etc.)
- **Real-time Timestamps**: Captures sale date and time automatically
- **POS Integration**: Seamlessly integrates with your existing POS system

### ✅ Complete Invoice Data
- **Business Details**: Skinship Beauty, Primark Towncenter Cainta, Rizal
- **Customer Information**: Name, email, phone (optional fields)
- **Itemized List**: Product name, ID, quantity, unit price, line total
- **Financial Summary**: Subtotal, tax (12% VAT), discounts, grand total
- **Payment Details**: Method, amount paid, change given

### ✅ Firebase Integration
- **Firestore Storage**: All invoices stored in 'invoices' collection
- **Real-time Sync**: Automatic updates across all devices
- **Authentication**: Uses existing Firebase auth system
- **Error Handling**: Robust error handling for all Firebase operations

### ✅ Invoice Management
- **Invoice List**: View all invoices with search and filtering
- **Invoice Details**: Complete invoice view with print functionality
- **Status Management**: Update invoice status (paid/pending/void)
- **Export Functionality**: Export invoices to CSV

## Files Overview

### 1. `invoice.html`
The main invoice management interface with:
- Invoice list with search and filters
- Statistics dashboard
- Invoice detail modal with print functionality
- Status update capabilities

### 2. `invoice-integration.js`
Core integration functions for your POS system:
- `createInvoiceFromSale()` - Creates invoice from POS sale data
- `generateInvoiceNumber()` - Generates unique invoice numbers
- `updateInvoiceStatus()` - Updates invoice status
- `getInvoiceById()` - Retrieves specific invoice
- `getInvoices()` - Gets filtered invoice list

### 3. `pos-integration-example.js`
Example implementations showing how to integrate with your existing POS:
- Sale completion integration
- Cart system integration
- Payment processing integration
- Form submission handling

## Quick Start Guide

### Step 1: Include the Integration Script
Add this to your Cashier.html or POS system:

```html
<!-- Firebase SDK (if not already included) -->
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js"></script>

<!-- Invoice Integration -->
<script src="invoice-integration.js"></script>
```

### Step 2: Call the Integration Function
When a sale is completed in your POS, call:

```javascript
// Example: When sale is completed
async function completeSale() {
  const saleData = {
    customerName: 'John Doe', // Optional
    customerEmail: 'john@example.com', // Optional
    customerPhone: '09123456789', // Optional
    items: [
      {
        name: 'Haircut',
        productId: 'HC-001',
        quantity: 1,
        unitPrice: 300,
        total: 300
      },
      {
        name: 'Hair Color',
        productId: 'HC-002',
        quantity: 1,
        unitPrice: 500,
        total: 500
      }
    ],
    subtotal: 800,
    taxAmount: 96, // 12% VAT
    grandTotal: 896,
    paymentMethod: 'cash', // cash, card, gcash, paymaya, bank_transfer
    amountPaid: 1000,
    changeGiven: 104
  };

  try {
    const invoice = await InvoiceIntegration.createInvoiceFromSale(saleData);
    console.log('Invoice created:', invoice.invoiceNumber);
    alert(`Invoice ${invoice.invoiceNumber} created successfully!`);
  } catch (error) {
    console.error('Error creating invoice:', error);
    alert('Failed to create invoice. Please try again.');
  }
}
```

### Step 3: Access Invoice Management
Navigate to `invoice.html` to:
- View all invoices
- Search and filter invoices
- View detailed invoice information
- Print invoices
- Update invoice status

## Data Structure

### Sale Data Format
```javascript
{
  customerName: "string (optional)",
  customerEmail: "string (optional)",
  customerPhone: "string (optional)",
  items: [
    {
      name: "string (required)",
      productId: "string (required)",
      quantity: "number (required)",
      unitPrice: "number (required)",
      total: "number (calculated)"
    }
  ],
  subtotal: "number (required)",
  taxAmount: "number (required)",
  discountAmount: "number (optional, default: 0)",
  grandTotal: "number (required)",
  paymentMethod: "string (required)",
  amountPaid: "number (required)",
  changeGiven: "number (optional, default: 0)"
}
```

### Invoice Document Structure (Firestore)
```javascript
{
  invoiceNumber: "IV-001",
  date: "Date object",
  timestamp: "Firebase timestamp",
  customerName: "string",
  customerEmail: "string",
  customerPhone: "string",
  items: "array of item objects",
  subtotal: "number",
  taxRate: "number (0.12 for 12% VAT)",
  taxAmount: "number",
  discountAmount: "number",
  grandTotal: "number",
  paymentMethod: "string",
  amountPaid: "number",
  changeGiven: "number",
  status: "string (paid/pending/void)",
  createdBy: "string",
  createdAt: "Firebase timestamp",
  lastUpdatedBy: "string",
  lastUpdatedAt: "Firebase timestamp"
}
```

## API Reference

### InvoiceIntegration.createInvoiceFromSale(saleData)
Creates a new invoice from POS sale data.

**Parameters:**
- `saleData` (Object): Sale data object (see data structure above)

**Returns:** Promise<Object> - Created invoice object

**Example:**
```javascript
const invoice = await InvoiceIntegration.createInvoiceFromSale({
  customerName: 'John Doe',
  items: [{ name: 'Haircut', productId: 'HC-001', quantity: 1, unitPrice: 300, total: 300 }],
  subtotal: 300,
  taxAmount: 36,
  grandTotal: 336,
  paymentMethod: 'cash',
  amountPaid: 400,
  changeGiven: 64
});
```

### InvoiceIntegration.generateInvoiceNumber()
Generates a unique sequential invoice number.

**Returns:** Promise<string> - Invoice number (e.g., "IV-001")

### InvoiceIntegration.updateInvoiceStatus(invoiceId, status, paymentMethod)
Updates the status of an existing invoice.

**Parameters:**
- `invoiceId` (string): Firebase document ID
- `status` (string): New status (paid/pending/void)
- `paymentMethod` (string, optional): Payment method if status is 'paid'

### InvoiceIntegration.getInvoiceById(invoiceId)
Retrieves a specific invoice by ID.

**Parameters:**
- `invoiceId` (string): Firebase document ID

**Returns:** Promise<Object> - Invoice object

### InvoiceIntegration.getInvoices(filters)
Gets a list of invoices with optional filtering.

**Parameters:**
- `filters` (Object, optional): Filter options
  - `status` (string): Filter by status
  - `startDate` (Date): Filter by start date
  - `endDate` (Date): Filter by end date

**Returns:** Promise<Array> - Array of invoice objects

## Integration Examples

### Basic POS Integration
```javascript
// In your existing POS sale completion function
async function processSale() {
  // Your existing sale processing logic
  const saleData = collectSaleData();
  
  // Create invoice
  try {
    const invoice = await InvoiceIntegration.createInvoiceFromSale(saleData);
    showSuccessMessage(`Invoice ${invoice.invoiceNumber} created!`);
  } catch (error) {
    console.error('Invoice creation failed:', error);
    // Handle error appropriately
  }
}
```

### Form Integration
```javascript
// If using forms for sales
document.getElementById('saleForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const formData = new FormData(this);
  const saleData = {
    customerName: formData.get('customerName'),
    items: JSON.parse(formData.get('items')),
    // ... other fields
  };
  
  try {
    const invoice = await InvoiceIntegration.createInvoiceFromSale(saleData);
    window.location.href = `invoice.html?view=${invoice.id}`;
  } catch (error) {
    alert('Error creating invoice');
  }
});
```

### Real-time Updates
```javascript
// Listen for new invoices
db.collection('invoices')
  .orderBy('timestamp', 'desc')
  .limit(1)
  .onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const invoice = change.doc.data();
        console.log('New invoice:', invoice.invoiceNumber);
        // Update your dashboard
      }
    });
  });
```

## Customization

### Business Information
Update business details in `invoice.html`:
```javascript
// In displayInvoiceDetail function
const businessInfo = `
  <h1>Skinship Beauty</h1>
  <p>Primark Towncenter Cainta, Rizal</p>
  <p>Phone: (02) 123-4567 | Email: info@skinshipbeauty.com</p>
`;
```

### Tax Rate
Default tax rate is 12% (VAT). To change:
```javascript
// In createInvoiceFromSale function
const taxRate = saleData.taxRate || 0.12; // Change 0.12 to your desired rate
```

### Invoice Number Format
To change invoice number format, modify `generateInvoiceNumber()`:
```javascript
// Change from IV-001 to INV-2025-001
return `INV-${new Date().getFullYear()}-${String(newNumber).padStart(3, '0')}`;
```

## Troubleshooting

### Common Issues

1. **"User must be authenticated" error**
   - Ensure user is logged in before creating invoices
   - Check Firebase authentication setup

2. **"Invoice not found" error**
   - Verify invoice ID is correct
   - Check if invoice exists in Firestore

3. **Permission denied errors**
   - Check Firestore security rules
   - Ensure user has write permissions

4. **Invoice numbers not sequential**
   - Check if 'metadata/invoiceCounter' document exists
   - Verify transaction is working correctly

### Debug Mode
Enable debug logging:
```javascript
// Add this to see detailed logs
console.log('Creating invoice with data:', saleData);
```

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify Firebase configuration
3. Ensure all required fields are provided
4. Check Firestore security rules

## Future Enhancements

- Email invoice functionality
- PDF generation
- Advanced reporting
- Multi-location support
- Customer management integration
- Payment tracking
- Recurring invoices
- Invoice templates
