module.exports = function(app, config) {
    const logging = app.logging.forModule('Event Router');

    return {
        start: () => {
            logging.logInfo('Event Router started');

            for(let eventRoute of config.events) {
                app.events.on(eventRoute.type, event => {
                    const sendTo = `publish-message-${eventRoute.sendTo}`;
                    logging.logInfo('Routing event', { from: eventRoute.type, to: sendTo });

                    if(eventRoute.append && event.data) {
                        logging.logInfo('Appending properties to routed event', { properties: Object.keys(eventRoute.append) });
                        event.data = Object.keys(eventRoute.append).reduce((data, key) => {
                            data[key] = eventRoute.append[key];

                            return data;
                        }, event.data);
                    }

                    app.events.emit(sendTo, event);
                });
            }
        }
    };
};
