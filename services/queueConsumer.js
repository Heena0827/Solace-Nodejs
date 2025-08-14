import solacejs from 'solclientjs';
import { sendSMS } from './smsService.js';
import { sendEmail } from './emailService.js';

const solace = solacejs.debug;
solace.SolclientFactory.init({ profile: solace.SolclientFactoryProfiles.version10 });

let session = null;
let consumers = [];

function connectAndConsume(queueNames) {
  if (!Array.isArray(queueNames) || queueNames.length === 0) {
    throw new Error("At least one queue name is required");
  }

  session = solace.SolclientFactory.createSession({
    url: process.env.URL,
    vpnName: process.env.VPN_NAME,
    userName: process.env.USER_NAME,
    password: process.env.PASSWORD,
    sslTrustStore: '../tls.crt',
  });

  session.on(solace.SessionEventCode.UP_NOTICE, () => {
    console.log(`Connected to Solace, consuming from queues: ${queueNames.join(', ')}`);

    queueNames.forEach((queueName) => {
      const DMQ_NAME = `#dlq#.${queueName}`;
      const consumer = session.createMessageConsumer({
        queueDescriptor: { name: queueName, type: solace.QueueType.QUEUE },
        acknowledgeMode: solace.MessageConsumerAcknowledgeMode.CLIENT,
        createIfMissing: false,
      });

      consumer.on(solace.MessageConsumerEventName.MESSAGE, async (message) => {
        try {
          const base64Str = message.getBinaryAttachment();
          const payload = JSON.parse(Buffer.from(base64Str, 'base64').toString('utf8'));
          console.log(`Consumer Processing message from ${queueName}:`, payload);

           let result;
          if (payload.type === 'sms') {
            result = await sendSMS(payload);            
          } else if (payload.type === 'email') {
            result = await sendEmail(payload);            
          }
          if (result?.success) {            
            console.log(`Consumer Acknowledged message from ${queueName}`);
          } else {
            console.error(`Consumer Error Failed to send from ${queueName}:`, result?.error);
            publishToDMQ(DMQ_NAME, payload);            
          }
        } catch (err) {
          const base64Str = message.getBinaryAttachment();
          const payload = JSON.parse(Buffer.from(base64Str, 'base64').toString('utf8'));
          publishToDMQ(DMQ_NAME, payload);
          console.error(`Consumer Error processing message from ${queueName}:`, err);
        }
        message.acknowledge();
      });

      consumer.connect();
      consumers.push(consumer);
    });
  });

  session.connect();
}

// Function to publish message to DMQ
function publishToDMQ(DMQ_NAME, payload) {
  try {
    console.log({DMQ_NAME, payload});
    const dmqMessage = solace.SolclientFactory.createMessage();
    dmqMessage.setDestination(solace.SolclientFactory.createDurableQueueDestination(DMQ_NAME));
    dmqMessage.setBinaryAttachment(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'));
    dmqMessage.setDeliveryMode(solace.MessageDeliveryModeType.PERSISTENT);
    session.send(dmqMessage);
    console.log('Message manually pushed to DMQ:', DMQ_NAME);
  } catch (err) {
    console.error('Failed to manually push message to DMQ:', err);
  }
}

// Graceful shutdown handler
function shutdown(signal) {
  console.log(`\n${signal} received. Disconnecting Solace session...`);
  if (session) {
    consumers.forEach(c => c.disconnect());
    session.disconnect();
    session.dispose();
    console.log('Solace session and consumers disconnected.');
  } else {
    console.log('No active Solace session to disconnect.');
  }
  process.exit(0);
}

// Listen for termination signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { connectAndConsume };

