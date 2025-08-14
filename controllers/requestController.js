import { publishMultipleToQueues } from '../services/queuePublisher.js';
import { parseStringPromise } from 'xml2js';

// Convert SOAP XML to JSON array
async function convertSoapToJson(xml) {
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    const messages =
        parsed['soapenv:Envelope']['soapenv:Body']
        ['v1:NotificationsendNotificationRequest1']
        ['v1:sendNotification']['v12:notificationMessage'];

    // Normalize to array if single
    const notifications = Array.isArray(messages) ? messages : [messages];

    return notifications.map(msg => {
        const result = {};
        if (msg['v12:smsDetails']) {
            const sms = msg['v12:smsDetails'];
            result.smsDetails = {
                message: sms['v12:message']?.trim(),
                mobileNumber: sms['v12:mobileNumber']?.trim(),
                messageLanguage: sms['v12:messageLanguage']?.trim(),
                senderCode: sms['v12:senderCode']?.trim() || undefined
            };
        }
        if (msg['v12:emailDetails']) {
            const email = msg['v12:emailDetails'];

            let recipients = Array.isArray(email['v12:recipient']) ? email['v12:recipient'] : [email['v12:recipient']];
            recipients = recipients.map(r => r.trim().replace(/[\r\n\t]/g, ''));


            result.emailDetails = {
                sender: email['v12:sender']?.trim().replace(/[\r\n\t]/g, ''),
                recipient: recipients,
                subject: email['v12:subject']?.trim(),
                message: email['v12:message']?.trim()
            };
        }
        return result;
    });
}

// Validation helper
function validateNotification(item) {
    const errors = [];
    const requiredSMSKeys = ['message', 'mobileNumber', 'messageLanguage'];
    const requiredEmailKeys = ['sender', 'recipient', 'subject', 'message'];

    if (item.smsDetails) {
        const sms = item.smsDetails;
        requiredSMSKeys.forEach(k => { if (!sms[k]) errors.push(`Missing smsDetails.${k}`); });

        const mobileRegex = /^[3567]\d{7}$/;
        if (sms.mobileNumber && !mobileRegex.test(sms.mobileNumber)) {
            errors.push('Invalid mobile number format (8 digits starting with 3/5/6/7)');
        }
    } 
    else if (item.emailDetails) {
        const email = item.emailDetails;
        requiredEmailKeys.forEach(k => { if (!email[k]) errors.push(`Missing emailDetails.${k}`); });

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (email.sender && !emailRegex.test(email.sender)) {
            errors.push('Invalid email format in sender');
        }

        if (!Array.isArray(email.recipient) || email.recipient.length === 0) {
            errors.push('Recipient must be a non-empty array of emails');
        } else {
            email.recipient.forEach((r, i) => {
                if (!emailRegex.test(r)) errors.push(`Invalid email format in recipient[${i}]`);
            });
        }
    }
    else {
        errors.push('Notification must contain smsDetails or emailDetails');
    }
    return errors;
}

export async function handleIncomingRequest(req, res) {
    try {
        const contentType = req.headers['content-type'];
        const token = req.headers['authorization'];

        if(token != process.env.TOKEN) {
            return res.status(401).json({
                Fault: {
                    faultcode: "401",
                    faultstring: "Access denied.",
                    faultactor: "",
                    detail: {
                        sendNotificationFault: 'Access denied.'
                    }
                }
            });
        }

        let data;
        let QUEUE_NAME_BACKEND = null;
        let QUEUE_NAME_APIM = null;

        if (contentType && contentType.includes('application/json')) {
            QUEUE_NAME_BACKEND = process.env.QUEUE_NAME_BACKEND;
            data = Array.isArray(req.body) ? req.body : [req.body];
        } else if (contentType && (contentType.includes('application/xml') || contentType.includes('text/xml'))) {
            QUEUE_NAME_APIM = process.env.QUEUE_NAME_APIM;
            data = await convertSoapToJson(req.body); 
        } else {
            return res.status(500).json({
                Fault: {
                    faultcode: "500",
                    faultstring: "Request Failed",
                    faultactor: "",
                    detail: {
                        sendNotificationFault: 'Request body type is neither JSON nor SOAP'
                    }
                }
            });
        }

        const validNotifications = [];
        const invalidNotifications = [];

        data.forEach((item, idx) => {
            const errors = validateNotification(item);
            if (errors.length > 0) {
                invalidNotifications.push({ index: idx, item, errors });
            } else {
                validNotifications.push(item);
            }
        });
        const queueName = (QUEUE_NAME_APIM != null)? QUEUE_NAME_APIM: QUEUE_NAME_BACKEND;
        const messages = validNotifications.map(item => {
            if (item.smsDetails) return {queueName, messageBody: {type:'sms', ...item.smsDetails }};
            if (item.emailDetails) return {queueName, messageBody: {type:'email', ...item.emailDetails }};
        });

        const totalExpected = messages.length;
        
        let publishResult = [];
        if (totalExpected > 0) {
           publishResult = await publishMultipleToQueues(messages);
           console.log({publishResult});
        }
        
        //Final response logic
        if (invalidNotifications.length === 0 && publishResult.status === 'success') {
            return res.status(200).json({
                status: 'Success',
                message: 'All notifications delivered successfully.',
                ackedMessages: publishResult.ackedMessages
            });
        }
        return res.status(207).json({
            Fault: {
                faultcode: "207",
                faultstring: "Some notifications failed to send or were invalid.",
                faultactor: "",
                detail: {
                    sendNotificationFault:{
                        totalNotifications: data.length,
                        validCount: validNotifications.length,
                        invalidCount: invalidNotifications.length,
                        invalidNotifications,
                        deliveryResults: publishResult
                    }
                }
            }
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            Fault: {
                faultcode: "500",
                faultstring: "Internal Server Error",
                faultactor: "",
                detail: {
                    sendNotificationFault: error.message || 'Internal Server Error'
                }
            }
        });
    }
}
