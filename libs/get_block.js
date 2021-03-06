const asyncConst = require("async/constant");
const auto = require("async/auto");

const hasLocalCore = require("./has_local_core");
const makeBitcoinCoreRequest = require("./make_bitcoin_core_request");
const returnResult = require("./return_result");
const setCachedBlock = require("./set_cached_block");

const coreErrorCodes = require("./../conf/core_error_codes");
const httpCodes = require("./../conf/http_status_codes");
const methods = require("./../conf/core_rpc_api_methods");

const blockchainCache = require("./../cache/blockchain_cache");

/** Get the block for a hash

  {
    hash: <Block Hash String>
  }

  @returns via cbk
  <Block Object>

  OR

  <null> // When the block is not found
*/
module.exports = (args, cbk) => {
  if (!args.hash) {
    return cbk([httpCodes.server_error, "Expected hash", args]);
  }

  return auto({
    getCachedBlock: (go_on) => {
      return go_on(null, blockchainCache.serialized_blocks[args.hash]);
    },

    getCoreBlock: ["getCachedBlock", (res, go_on) => {
      if (!!res.getCachedBlock || !hasLocalCore({})) { return go_on(); }

      return makeBitcoinCoreRequest({
        ignore_error_code: coreErrorCodes.invalid_address_or_key,
        method: methods.get_block,
        params: [args.hash, false]
      },
      go_on);
    }],

    cacheCoreBlock: ["getCoreBlock", (res, go_on) => {
      if (!res.getCoreBlock) { return go_on(); }

      return setCachedBlock({block: res.getCoreBlock, hash: args.hash}, go_on);
    }],

    block: ["getCachedBlock", "getCoreBlock", (res, go_on) => {
      return go_on(null, res.getCachedBlock || res.getCoreBlock);
    }]
  },
  returnResult({result: "block"}, cbk));
};

