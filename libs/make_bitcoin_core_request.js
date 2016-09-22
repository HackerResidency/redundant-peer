const BitcoinCoreClient = require("bitcoin").Client;

const hasLocalCore = require("./has_local_core");

const codes = require("./../conf/http_status_codes");

let client = null;
let credentials = null;

/** Make a request to the local Bitcoin Core

  {
    method: <Bitcoin Core RPC String>
    [params]: Array<Any>
  }

  @returns via cbk
  <Response Object>
*/
module.exports = (args, cbk) => {
  if (!args.method) {
    return cbk([codes.server_error, "Expected method", args]);
  }

  if (!hasLocalCore({})) {
    return cbk([codes.server_error, "Expected local Core"]);
  }

  credentials = credentials || require("./../credentials")

  const pass = credentials.bitcoin_core_rpc_password;
  const user = credentials.bitcoin_core_rpc_user;

  client = client || new BitcoinCoreClient({pass, user});

  const method = args.method;
  const params = args.params || [];

  return client.cmd([{method, params}], (err, response) => {
    if (!!err) {
      return cbk([
        codes.server_error,
        "Bitcoin Core Data",
        {code: err.code, message: err.message}
      ]);
    }

    return cbk(null, response);
  });
};

