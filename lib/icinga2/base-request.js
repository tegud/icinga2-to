const fs = require('fs');

function createAuthHeader(config) {
    const basicAuth = new Buffer(`${config.username}:${config.password}`).toString('base64');
    return `Basic ${basicAuth}`;
}

function loadCertificate(config) {
    const certificatePath = config.certificatePath[0] === '.' ? `${__dirname}/../../${config.certificatePath}` : config.certificatePath;
    try {
        return fs.readFileSync(certificatePath);
    }
    catch(ex) {
        console.log(`Failed to load Icinga2 certificate (${certificatePath}): ${ex}`);
    }
}

module.exports = function createBaseRequest(config) {
    let cert;

    if(config.certificatePath) {
        cert = loadCertificate(config);
    }

    return {
        ca: cert,
        headers: {
            'Accept': 'application/json',
            'Authorization': createAuthHeader(config)
        }
    };
};
