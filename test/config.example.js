// An example configuration file for Fusion server. These settings probably don't make sense as they are for testing, don't use them.

module.exports = config = {};

config.insecure = true;
config.port = 5151;
config.dev =  true;
config.auto_create_index = false;
config.auto_create_table = false;
config.cert_file = '/certs/cert.pem';
config.connect = 'localhost:28015';
config.debug = true;
config.key_file = './key.pem';
