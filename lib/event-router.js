const _ = require('lodash');

module.exports = function(app, config) {
    const logging = app.logging.forModule('Event Router');

    function matches(expected, actual) {
        if(actual.includes) {
            return actual.includes(expected);
        }

        return expected === actual;
    }

    function filter(routeFilter, event) {
        for(const key of Object.keys(routeFilter)) {
            const eventValue = _.get(event.data, key);

            if(!eventValue || !matches(routeFilter[key], eventValue)) {
                logging.logDebug('Event does not match filter', { filterField: key, expectedValue: routeFilter[key], actualValue: eventValue });
                return false;
            }
        }

        logging.logInfo('Event matches filter', { filter: routeFilter });

        return true;
    }

    return {
        start: () => {
            logging.logInfo('Event Router started');

            for(const eventRoute of config.events) {
                app.events.on(eventRoute.type, event => {
                    event = JSON.parse(JSON.stringify(event));

                    const sendTo = `publish-message-${eventRoute.sendTo}`;
                    logging.logInfo('Routing event', { from: eventRoute.type, to: sendTo, filter: JSON.stringify(eventRoute.filter) });

                    if(eventRoute.filter && !filter(eventRoute.filter, event)) {
                        return;
                    }

                    if(eventRoute.append && event.data) {
                        logging.logDebug('Appending properties to routed event', { properties: Object.keys(eventRoute.append) });
                        event.data = Object.keys(eventRoute.append).reduce((data, key) => {
                            logging.logDebug('Appending property to routed event', { property: key, value: eventRoute.append[key] });
                            data[key] = eventRoute.append[key];

                            return data;
                        }, event.data);
                    }

                    if(eventRoute.eventType) {
                        event.type = eventRoute.eventType;
                    }

                    app.events.emit(sendTo, event);
                });
            }
        }
    };
};
