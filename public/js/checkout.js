async function startCheckout(button) {
  const errorBanner = document.getElementById('errorBanner');
  errorBanner.style.display = 'none';

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Starting checkout…';

  try {
    // 1. Ask our server to create an order. Amount is decided server-side —
    //    we never send a price from the browser.
    const orderRes = await fetch('/api/create-order', { method: 'POST' });
    if (!orderRes.ok) throw new Error('Could not start checkout. Please try again.');
    const order = await orderRes.json();

    // 2. Open Razorpay's checkout modal with that order.
    const rzp = new Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name: '50 Life-Changing eBook Summaries',
      description: 'Instant digital download',
      theme: { color: '#d9b45c' },
      handler: async function (response) {
        // 3. Payment succeeded on Razorpay's side — now verify the signature
        //    on our server before treating it as a real, paid order.
        button.textContent = 'Verifying payment…';
        try {
          const verifyRes = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response),
          });
          const verifyData = await verifyRes.json();

          if (verifyRes.ok && verifyData.success) {
            window.location.href = '/thank-you.html?token=' + encodeURIComponent(verifyData.download_token);
          } else {
            errorBanner.textContent = 'We could not verify your payment. If money was deducted, please contact support with your payment ID: ' + (response.razorpay_payment_id || 'unknown') + '.';
            errorBanner.style.display = 'block';
            button.disabled = false;
            button.textContent = originalText;
          }
        } catch (err) {
          errorBanner.textContent = 'Payment verification failed. Please contact support with your payment ID: ' + (response.razorpay_payment_id || 'unknown') + '.';
          errorBanner.style.display = 'block';
          button.disabled = false;
          button.textContent = originalText;
        }
      },
      modal: {
        ondismiss: function () {
          button.disabled = false;
          button.textContent = originalText;
        },
      },
    });

    rzp.on('payment.failed', function (response) {
      errorBanner.textContent = 'Payment failed: ' + (response.error && response.error.description ? response.error.description : 'please try again.');
      errorBanner.style.display = 'block';
      button.disabled = false;
      button.textContent = originalText;
    });

    rzp.open();
    button.textContent = originalText;
    button.disabled = false;
  } catch (err) {
    errorBanner.textContent = err.message || 'Something went wrong. Please try again.';
    errorBanner.style.display = 'block';
    button.disabled = false;
    button.textContent = originalText;
  }
}

document.getElementById('buyBtn')?.addEventListener('click', (e) => startCheckout(e.currentTarget));
document.getElementById('buyBtnSticky')?.addEventListener('click', (e) => startCheckout(e.currentTarget));
