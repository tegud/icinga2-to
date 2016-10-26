const logger = require('./logger');
const core = require('./core');
const _ = require('lodash');

module.exports = function() {
	function start() {
	    return new Promise(resolve => resolve(core.logging.logInfo('Starting Icinga2 To...')));
	}

	return {
		start: () => start()
            .then(() => core.logging.setLogger(require('./logger')))
            .then(() => core.config.setDefault({
                "http-server": { "port": 1234 }
            }))
            .then(() => core.use('rs-http-server'))
			.then(() => core.use('icinga-event-stream', require('./icinga-event-stream')))
			.then(() => core.use('downtime-monitor', require('./downtime-monitor')))
            .then(() => core.config.setMapToModules(config => new Promise(resolve => resolve({
                'http-server': [{ module: 'http-server', port: config['http-server'].port }],
				'icinga-event-stream': [_.merge({ module: 'icinga-event-stream' }, config.icinga)],
				'downtime-monitor': [{ module: 'downtime-monitor' }]
            }))))
            .then(() => core.start())
            .then(() => new Promise(resolve => resolve(core.logging.logInfo('Start up completed'))))
            .catch(err => core.logging.logError('Start up failed', { error: err }))
	};
};
