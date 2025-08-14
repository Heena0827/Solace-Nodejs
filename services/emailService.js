import nodemailer from 'nodemailer';

async function sendEmail(payload) {
    console.log({payload});
  try {

    const recipients = Array.isArray(payload.recipient) ? payload.recipient : [payload.recipient];
    if (recipients.includes('dummy@dummy.com')) {
      console.log('dummy email found');
      return { success: false };
    }
    // Create SMTP transporter
    let transporter = nodemailer.createTransport({
      host: process.env.EMAIL_IP,
      port: process.env.EMAIL_PORT,
      secure: false,
      tls: {
        rejectUnauthorized: false
      }
    });
    
    let mailOptions = {
      from: payload.sender,
      to: recipients,
      subject: payload.subject,        
      // text: payload.message,
      html: payload.message  
    };
console.log({mailOptions});
  
    let info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.response);

    return { success: true, data: info.response };
  } catch (error) {
    console.error('Error sending email:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

export { sendEmail };
