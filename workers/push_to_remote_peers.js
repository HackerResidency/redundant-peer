const auto = require("async/auto");
const each = require("async/each");
const forever = require("async/forever");

const getBestBlockHash = require("./../libs/get_best_block_hash");
const getBlock = require("./../libs/get_block");
const getNewerBlocks = require("./../libs/get_newer_blocks");
const hasLocalCore = require("./../libs/has_local_core");
const logError = require("./../libs/log_error");
const makeBestBlockHashRequest = require("./make_get_best_block_hash_request");
const makePushBlocksRequest = require("./make_push_blocks_request");

const httpCodes = require("./../conf/http_status_codes");
const server = require("./../conf/server");

const exitEarlyFlag = "exit_early";

/** Send blocks to remote peers

  {}
*/
module.exports = (args) => {
  // Exit early when there is no local Core instance to push data from
  if (!hasLocalCore({})) { return; }

  const credentials = require("./../credentials");

  // Exit early when there are no cache peers to send data to
  if (!Array.isArray(credentials.cache_peers)) { return; }

  return each(credentials.cache_peers, (peer, finishedPushing) => {
    let lastGuessHash;
    let lastBestHash;

    return forever(
      (completedPush) => {
        return auto({
          // Get the local chain tip
          getBestBlockHash: (go_on) => {
            return getBestBlockHash({}, go_on);
          },

          // Get the remote chain tip
          getRemoteBestBlockHash: ["getBestBlockHash", (res, go_on) => {
            // Exit early when we are just re-sending the same block info
            if (lastBestHash === res.getBestBlockHash) {
              return go_on(exitEarlyFlag);
            }

            return makeBestBlockHashRequest({
              hash: res.getBestBlockHash,
              host: peer.host
            },
            go_on);
          }],

          // Determine if the remote is already at the best hash
          isRemoteAtBest: [
            "getBestBlockHash",
            "getRemoteBestBlockHash",
            (res, go_on) =>
          {
            return go_on(null, !res.getRemoteBestBlockHash);
          }],

          // Pull the block that the remote tip references
          getRemoteTipBlock: [
            "getRemoteBestBlockHash",
            "isRemoteAtBest",
            (res, go_on) =>
          {
            if (!res.getRemoteBestBlockHash || !!res.isRemoteAtBest) {
              return go_on();
            }

            return getBlock({hash: res.getRemoteBestBlockHash}, go_on);
          }],

          // Determine if the remote best hash is a local block we know about
          hasRemoteUnknownBlock: [
            "getRemoteTipBlock",
            "isRemoteAtBest",
            (res, go_on) =>
          {
            const isUnknown = !res.isRemoteAtBest && !res.getRemoteTipBlock;

            return go_on(null, isUnknown);
          }],

          // When the remote best block is unknown, send the most recent block
          getBestGuessBlock: ["hasRemoteUnknownBlock", (res, go_on) => {
            if (!res.hasRemoteUnknownBlock) { return go_on(); }

            return getBlock({hash: res.getBestBlockHash}, go_on);
          }],

          // When the remote is behind, pull some blocks to send
          getMissingBlocks: [
            "getBestBlockHash",
            "getBestGuessBlock",
            "getRemoteBestBlockHash",
            "isRemoteAtBest",
            (res, go_on) =>
          {
            if (!!res.isRemoteAtBest || !!res.getBestGuessBlock) {
              return go_on();
            }

            return getNewerBlocks({
              catchup_limit: server.service_block_catchup_limit,
              hashes: [res.getRemoteBestBlockHash],
              limit: server.max_push_blocks
            },
            (err, blocks) => {
              if (!!err) {
                return getBlock({hash: res.getBestBlockHash}, (err, block) => {
                  if (!!err) { return go_on(err); }

                  return go_on(null, {blocks: [block]});
                });
              }

              return go_on(null, blocks);
            });
          }],

          // Figure out which blocks should be sent, if any
          blocksToPush: [
            "getBestBlockHash",
            "getBestGuessBlock",
            "getMissingBlocks",
            "isRemoteAtBest",
            (res, go_on) =>
          {
            if (!!res.isRemoteAtBest) { return go_on(null, []); }

            const bestGuessBlock = res.getBestGuessBlock;

            // When sending a best guess block, only send it one time
            if (!!bestGuessBlock && res.getBestBlockHash === lastGuessHash) {
              return go_on(null, []);
            }

            return go_on(null, res.getMissingBlocks.blocks || [bestGuessBlock]);
          }],

          // Send the blocks over the wire
          makePushBlocksRequest: [
            "blocksToPush",
            "getBestBlockHash",
            (res, go_on) =>
          {
            if (!res.blocksToPush.length) {
              lastBestHash = res.getBestBlockHash;

              return go_on();
            }

            return makePushBlocksRequest({
              blocks: res.blocksToPush,
              host: peer.host,
              secret: peer.secret
            },
            go_on);
          }],

          // Record that we sent a guess block
          setLastBestGuessBlock: [
            "blocksToPush",
            "getBestBlockHash",
            "getBestGuessBlock",
            "makePushBlocksRequest",
            (res, go_on) =>
          {
            if (!res.getBestGuessBlock || !res.blocksToPush.length) {
              return go_on();
            }

            lastGuessHash = res.getBestBlockHash;

            return go_on();
          }],
        },
        (err) => {
          if (!!err && err !== exitEarlyFlag) { logError({err: err}); }

          return setTimeout(completedPush, server.push_timeout_ms);
        });
      },
      finishedPushing
    );
  },
  (err) => {
    if (!!err) { return logError({err: err}); }

    return;
  });
};

