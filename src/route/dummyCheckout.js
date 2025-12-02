import express from 'express';

const router = express.Router();

// GET /dummy-checkout - Dummy payment page
router.get('/dummy-checkout', (req, res) => {
  const { order } = req.query;
  
  if (!order) {
    return res.status(400).send('Missing order parameter');
  }

  // Simple HTML page for dummy payment
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Dummy Payment - ClientSure</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }
            .container { border: 1px solid #ddd; padding: 30px; border-radius: 8px; }
            button { background: #007cba; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; margin: 10px; }
            button:hover { background: #005a87; }
            .fail { background: #dc3545; }
            .fail:hover { background: #c82333; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>🔒 Dummy Payment Gateway</h2>
            <p><strong>Order ID:</strong> ${order}</p>
            <p><strong>Status:</strong> Pending Payment</p>
            <hr>
            <p>This is a dummy payment page for testing purposes.</p>
            
            <button onclick="simulatePayment('success')">
                ✅ Simulate Successful Payment
            </button>
            
            <button onclick="simulatePayment('failed')" class="fail">
                ❌ Simulate Failed Payment
            </button>
        </div>

        <script>
            function simulatePayment(status) {
                // Dynamic URLs based on environment
                const isProduction = window.location.hostname !== 'localhost';
                const backendUrl = isProduction 
                    ? 'https://client-sure-backend.vercel.app'
                    : 'http://localhost:5000';
                const frontendUrl = isProduction 
                    ? 'https://client-sure-frontend.vercel.app'
                    : 'http://localhost:3000';
                
                const webhookUrl = backendUrl + '/api/payments/webhook';
                
                if (status === 'success') {
                    // Simulate successful payment webhook
                    fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-signature': 'dummy-signature-dev'
                        },
                        body: JSON.stringify({
                            type: 'payment.success',
                            data: {
                                order_id: 'prov_' + Date.now(),
                                clientOrderId: '${order}',
                                email: localStorage.getItem('pendingUserEmail') || 'test@example.com',
                                name: localStorage.getItem('pendingUserName') || 'Test User',
                                amount: 299
                            }
                        })
                    }).then(response => {
                        if (response.ok) {
                            alert('Payment Successful! Redirecting...');
                            const userEmail = localStorage.getItem('pendingUserEmail') || 'test@example.com';
                            window.location.href = frontendUrl + '/payment-success?email=' + encodeURIComponent(userEmail);
                        } else {
                            alert('Payment processing failed');
                        }
                    }).catch(err => {
                        console.error('Webhook error:', err);
                        alert('Error processing payment');
                    });
                } else {
                    alert('Payment Failed! Please try again.');
                    window.location.href = frontendUrl;
                }
            }
        </script>
    </body>
    </html>
  `;

  res.send(html);
});

export default router;