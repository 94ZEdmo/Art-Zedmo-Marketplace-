export const sendEmail = async (to, subject, html) => {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: "ART-ZEDMO", email: "artzedmo@gmail.com" },
      to: [{ email: to }],
      subject: subject,
      htmlContent: html
    })
  });
  const data = await res.json();
  console.log("Mail envoyé:", data);
  return true;
};
