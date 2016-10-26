module.exports = function(app, config) {
    const logging = app.logging.forModule('Downtime monitor');
    let lastState;
    let emitAsDisconnectedTimeout;

    return {
        start: () => {
            app.events.on('update-status', currentState => {
                if(!lastState) {
                    lastState = currentState.status;
                }

                if(lastState === currentState.status) {
                    return;
                }

                if(lastState === 'ok') {
                    emitAsDisconnectedTimeout = setTimeout(() => {
                        logging.logInfo('Icinga connection lost');
                    }, 10000);
                }
                else {
                    logging.logInfo('Icinga connection restored');
                    if(emitAsDisconnectedTimeout) {
                        clearTimeout(emitAsDisconnectedTimeout);
                    }
                }

                lastState = currentState.status;
            });
        }
    };
};
