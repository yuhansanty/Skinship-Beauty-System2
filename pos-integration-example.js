/**
 * POS Integration Example
 * This file shows how to integrate the invoice system with your existing POS
 * Copy the relevant parts to your Cashier.html or POS system
 */

// Include the invoice integration script in your HTML:
// <script src="invoice-integration.js"></script>

// Example 1: Basic integration when sale is completed
async function completeSale() {
  // Your existing POS sale data
  const saleData = {
    customerName: document.getElementById('customerName').value || 'Walk-in Customer',
    customerEmail: document.getElementById('customerEmail').value || '',
    customerPhone: document.getElementById('customerPhone').value || '',
    items: getCartItems(), // Your existing function to get cart items
    subtotal: calculateSubtotal(), // Your existing function
    taxAmount: calculateTax(), // Your existing function
    grandTotal: calculateTotal(), // Your existing function
    paymentMethod: getSelectedPaymentMethod(), // Your existing function
    amountPaid: parseFloat(document.getElementById('amountPaid').value) || 0,
    changeGiven: calculateChange() // Your existing function
  };

  try {
    // Create invoice automatically
    const invoice = await InvoiceIntegration.createInvoiceFromSale(saleData);
    
    // Show success message
    showSuccessMessage(`Sale completed! Invoice ${invoice.invoiceNumber} created.`);
    
    // Clear the POS
    clearCart();
    resetForm();
    
    // Optional: Print receipt
    printReceipt(invoice);
    
  } catch (error) {
    console.error('Error completing sale:', error);
    showErrorMessage('Failed to complete sale. Please try again.');
  }
}

// Example 2: Integration with your existing cart system
function addItemToCart(product) {
  // Your existing add to cart logic
  const cartItem = {
    name: product.name,
    productId: product.id,
    quantity: 1,
    unitPrice: product.price,
    total: product.price
  };
  
  // Add to your existing cart
  addToCart(cartItem);
  
  // Update display
  updateCartDisplay();
}

// Example 3: Integration with payment processing
async function processPayment(paymentData) {
  try {
    // Your existing payment processing
    const paymentResult = await processPaymentMethod(paymentData);
    
    if (paymentResult.success) {
      // Complete the sale and create invoice
      const saleData = {
        ...getCurrentSaleData(),
        paymentMethod: paymentData.method,
        amountPaid: paymentData.amount,
        changeGiven: paymentData.change || 0
      };
      
      const invoice = await InvoiceIntegration.createInvoiceFromSale(saleData);
      
      // Show invoice to customer
      showInvoiceToCustomer(invoice);
      
    } else {
      throw new Error(paymentResult.error);
    }
    
  } catch (error) {
    console.error('Payment processing error:', error);
    showErrorMessage('Payment failed. Please try again.');
  }
}

// Example 4: Manual invoice creation (for walk-in customers)
async function createManualInvoice() {
  const customerName = prompt('Enter customer name (optional):') || 'Walk-in Customer';
  const customerEmail = prompt('Enter customer email (optional):') || '';
  const customerPhone = prompt('Enter customer phone (optional):') || '';
  
  const saleData = {
    customerName: customerName,
    customerEmail: customerEmail,
    customerPhone: customerPhone,
    items: getCartItems(),
    subtotal: calculateSubtotal(),
    taxAmount: calculateTax(),
    grandTotal: calculateTotal(),
    paymentMethod: 'cash',
    amountPaid: calculateTotal(),
    changeGiven: 0
  };
  
  try {
    const invoice = await InvoiceIntegration.createInvoiceFromSale(saleData);
    showSuccessMessage(`Manual invoice ${invoice.invoiceNumber} created.`);
  } catch (error) {
    console.error('Error creating manual invoice:', error);
    showErrorMessage('Failed to create invoice.');
  }
}

// Example 5: Integration with your existing form submission
document.getElementById('saleForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  // Collect form data
  const formData = new FormData(this);
  const saleData = {
    customerName: formData.get('customerName'),
    customerEmail: formData.get('customerEmail'),
    customerPhone: formData.get('customerPhone'),
    items: JSON.parse(formData.get('items') || '[]'),
    subtotal: parseFloat(formData.get('subtotal')),
    taxAmount: parseFloat(formData.get('taxAmount')),
    grandTotal: parseFloat(formData.get('grandTotal')),
    paymentMethod: formData.get('paymentMethod'),
    amountPaid: parseFloat(formData.get('amountPaid')),
    changeGiven: parseFloat(formData.get('changeGiven'))
  };
  
  try {
    // Create invoice
    const invoice = await InvoiceIntegration.createInvoiceFromSale(saleData);
    
    // Redirect to invoice page or show success
    window.location.href = `invoice.html?view=${invoice.id}`;
    
  } catch (error) {
    console.error('Error processing sale:', error);
    alert('Error processing sale. Please try again.');
  }
});

// Example 6: Real-time invoice updates
function setupInvoiceUpdates() {
  // Listen for new invoices (if you want real-time updates)
  db.collection('invoices')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const invoice = change.doc.data();
          console.log('New invoice created:', invoice.invoiceNumber);
          // Update your dashboard or show notification
        }
      });
    });
}

// Example 7: Integration with your existing inventory system
async function updateInventoryAfterSale(saleData) {
  try {
    // Update inventory quantities
    for (const item of saleData.items) {
      await db.collection('inventory').doc(item.productId).update({
        qty: firebase.firestore.FieldValue.increment(-item.quantity),
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    
    console.log('Inventory updated after sale');
  } catch (error) {
    console.error('Error updating inventory:', error);
    // Don't throw error - invoice was already created
  }
}

// Example 8: Complete sale with inventory update
async function completeSaleWithInventoryUpdate() {
  const saleData = getCurrentSaleData();
  
  try {
    // Create invoice
    const invoice = await InvoiceIntegration.createInvoiceFromSale(saleData);
    
    // Update inventory
    await updateInventoryAfterSale(saleData);
    
    // Show success
    showSuccessMessage(`Sale completed! Invoice ${invoice.invoiceNumber} created and inventory updated.`);
    
  } catch (error) {
    console.error('Error completing sale:', error);
    showErrorMessage('Failed to complete sale. Please try again.');
  }
}

// Helper functions (implement these based on your existing POS system)
function getCartItems() {
  // Return your cart items in the expected format
  return [
    { name: 'Haircut', productId: 'HC-001', quantity: 1, unitPrice: 300, total: 300 },
    { name: 'Hair Color', productId: 'HC-002', quantity: 1, unitPrice: 500, total: 500 }
  ];
}

function calculateSubtotal() {
  // Your existing subtotal calculation
  return 800;
}

function calculateTax() {
  // Your existing tax calculation
  return 96;
}

function calculateTotal() {
  // Your existing total calculation
  return 896;
}

function getSelectedPaymentMethod() {
  // Return selected payment method
  return document.querySelector('input[name="paymentMethod"]:checked')?.value || 'cash';
}

function calculateChange() {
  // Your existing change calculation
  const amountPaid = parseFloat(document.getElementById('amountPaid').value) || 0;
  const total = calculateTotal();
  return Math.max(0, amountPaid - total);
}

function clearCart() {
  // Your existing cart clearing logic
  console.log('Cart cleared');
}

function resetForm() {
  // Your existing form reset logic
  console.log('Form reset');
}

function showSuccessMessage(message) {
  // Your existing success message display
  alert(message);
}

function showErrorMessage(message) {
  // Your existing error message display
  alert(message);
}

function printReceipt(invoice) {
  // Your existing receipt printing logic
  console.log('Printing receipt for invoice:', invoice.invoiceNumber);
}

function showInvoiceToCustomer(invoice) {
  // Show invoice to customer (modal, new window, etc.)
  window.open(`invoice.html?view=${invoice.id}`, '_blank');
}

function getCurrentSaleData() {
  // Return current sale data from your POS
  return {
    customerName: document.getElementById('customerName').value || 'Walk-in Customer',
    customerEmail: document.getElementById('customerEmail').value || '',
    customerPhone: document.getElementById('customerPhone').value || '',
    items: getCartItems(),
    subtotal: calculateSubtotal(),
    taxAmount: calculateTax(),
    grandTotal: calculateTotal(),
    paymentMethod: getSelectedPaymentMethod(),
    amountPaid: parseFloat(document.getElementById('amountPaid').value) || 0,
    changeGiven: calculateChange()
  };
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
  // Setup any necessary initialization
  setupInvoiceUpdates();
  
  // Add event listeners for your existing POS buttons
  const completeSaleBtn = document.getElementById('completeSaleBtn');
  if (completeSaleBtn) {
    completeSaleBtn.addEventListener('click', completeSale);
  }
  
  const createInvoiceBtn = document.getElementById('createInvoiceBtn');
  if (createInvoiceBtn) {
    createInvoiceBtn.addEventListener('click', createManualInvoice);
  }
});
