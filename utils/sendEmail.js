const SibApiV3Sdk = require('sib-api-v3-sdk');
const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;

const sendEmail = async (to, subject, html) => {
  const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  
  sendSmtpEmail.sender = { name: "ART-ZEDMO", email: process.env.SMTP_FROM || "artzedmo@gmail.com" };
  sendSmtpEmail.to = [{ email: to }];
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = html;

  try {
    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log("Email ART-ZEDMO envoyé:", data.messageId);
    return true;
  } catch (error) {
    console.error("Erreur Brevo:", error.response?.body || error.message);
    return false;
  }
};

module.exports = sendEmail;
