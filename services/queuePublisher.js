import crypto from 'crypto';
import solacejs from 'solclientjs';

const solace = solacejs.debug;
solace.SolclientFactory.init({ profile: solace.SolclientFactoryProfiles.version10 });

function connectSession() {
  return solace.SolclientFactory.createSession({
    url: process.env.URL,
    vpnName: process.env.VPN_NAME,
    userName: process.env.USER_NAME,
    password: process.env.PASSWORD,
    sslTrustStore: '../tls.crt',
    publisherProperties: {
      acknowledgeMode: solace.MessagePublisherAcknowledgeMode.PER_MESSAGE,
    },
  });
}

function publishMultipleToQueues(messageList) {
  return new Promise((resolve, reject) => {
    const session = connectSession();

    const ackedMessages = [];
    const totalMessages = messageList.length;

    session.on(solace.SessionEventCode.UP_NOTICE, () => {
      console.log('Connected to Solace. Publishing messages...');

      for (const { queueName, messageBody } of messageList) {
        const message = solace.SolclientFactory.createMessage();
        const destination = solace.SolclientFactory.createDurableQueueDestination(queueName);

        message.setDestination(destination);
        message.setDeliveryMode(solace.MessageDeliveryModeType.PERSISTENT);

        const encodedPayload = Buffer.from(JSON.stringify(messageBody), 'utf8').toString('base64');
        message.setBinaryAttachment(encodedPayload);
        message.setDMQEligible(true);              // allow broker to move to DMQ when needed
        message.setTimeToLive(5 * 60 * 1000);     // optional TTL (5 minutes)
        message.setCorrelationKey(`ck-${crypto.randomUUID()}`);
        
        session.send(message);
        console.log(`Sent to ${queueName}:`, messageBody);
      }
    });

    session.on(solace.SessionEventCode.ACKNOWLEDGED_MESSAGE, (event) => {
      console.log('Publisher Message acknowledged:', event.correlationKey);
      ackedMessages.push(event.correlationKey);
      
      if (ackedMessages.length === totalMessages) {
        console.log('Publisher - All messages pushed.');
        session.disconnect();
        resolve({
          'status':'success',
          'ackedMessages':ackedMessages
        });
      }
    });

    session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (event) => {
      console.error('Connection failed:', event.infoStr);
      reject({
        'status':'error',
        'message':'Connection failed'
      });
    });

    session.connect();
  });
}

export { publishMultipleToQueues };
