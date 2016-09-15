/** Test the scenario where there is a very simple catch up case

  # Setup: Alice, Bob

  Alice has a blockchain that looks like a, b
  Bob has a blockchain that looks like a

  1. Bob requests updates from Alice (fake a has no b)
  2. Bob adds updates from Alice into his blockchain (stop faking "no b")
*/
const assert = require("assert");

const _ = require("underscore");
const auto = require("async/auto");
const vows = require("vows");

const libsPath = "./../../libs/";
const testPath = "./../";

const getBestBlockHash = require(libsPath + "get_best_block_hash");
const getBlock = require(libsPath + "get_block");
const getPrecedingBlockHash = require(libsPath + "get_preceding_block_hash");
const importUpdated = require(testPath + "macros/import_updated_blocks");
const requestBlocks = require(testPath + "macros/request_blocks_after_hashes");

vows
  .describe("Basic Catchup")
  .addBatch({
    "When out-of-date Bob asks up-to-date Alice for block updates": {
      topic: function() {
        return auto({
          getAliceTipHash: (go_on) => {
            return getBestBlockHash({}, go_on);
          },

          getAliceTipBlock: ["getAliceTipHash", (res, go_on) => {
            return getBlock({hash: res.getAliceTipHash}, go_on);
          }],

          getBobTipHash: ["getAliceTipHash", (res, go_on) => {
            return getPrecedingBlockHash({hash: res.getAliceTipHash}, go_on);
          }],

          getUpdatesFromAlice: ["getBobTipHash", (res, go_on) => {
            return requestBlocks({hashes: [res.getBobTipHash]}, go_on);
          }],

          importBlocks: ["getUpdatesFromAlice", (res, go_on) => {
            return importUpdated({blocks: res.getUpdatesFromAlice}, go_on);
          }]
        },
        this.callback);
      },

      "Alice returns Bob the missing block": (err, res) => {
        assert.deepEqual(err, null);

        const missingBlocks = res.getUpdatesFromAlice;

        assert.isArray(missingBlocks);

        assert.deepEqual(missingBlocks.length, [res.getAliceTipHash].length);

        assert.deepEqual(_(missingBlocks).first(), res.getAliceTipBlock);

        return;
      }
    }
  })
  .export(module); // Run it

