import axios from 'axios';
import https from 'https';

async function sendSMS(payload) {
  console.log(payload);
  const params = {
    ApplicationID: process.env.SMS_ApplicationID,
    Password: process.env.SMS_Password,
    MobileNumber: payload.mobileNumber,
    MessageText: payload.message,
    ConfirmDelivery: 'true',
    Priority: '1'
  };
  var smsurl = process.env.SMS_URL;

  try {
    // Create an HTTPS agent that ignores SSL certificate errors
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });

    const response = await axios.post(smsurl, params, { httpsAgent });
    console.log('SMS Sent:', response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error sending SMS:', error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
}

export { sendSMS };
