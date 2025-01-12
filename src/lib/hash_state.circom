// Refer to:
// https://github.com/hermeznetwork/circuits/blob/master/src/lib/hash-state.circom

include "poseidon.circom";
include "binary_merkle_tree.circom";

/**
 * Computes the hash of an account state
 * State Hash = Poseidon(e0, e1, e2, e3)
 * e0: sign(1 bit) | nonce(40bits)
 * e1: balanceRoot
 * e2: ay
 * e3: ethAddr
 * @input nonce - {Uint40} - nonce
 * @input sign - {Bool} - babyjubjub sign
 * @input balanceRoot - {Field} - account's balance_tree root
 * @input ay - {Field} - babyjubjub Y coordinate
 * @input ethAddr - {Uint160} - etehreum address
 * @input orderRoot - {Field} - account's order_tree root
 * @output out - {Field} - resulting poseidon hash
 */
template HashAccount() {
    signal input nonce;
    signal input sign;
    signal input balanceRoot;
    signal input ay;
    signal input ethAddr;
    signal input orderRoot;

    signal output out;

    signal e0; // build e0 element

    e0 <== nonce + sign * (1 << 40);

    component hash = Poseidon(5);

    hash.inputs[0] <== e0;
    hash.inputs[1] <== balanceRoot;
    hash.inputs[2] <== ay;
    hash.inputs[3] <== ethAddr;
    hash.inputs[4] <== orderRoot;

    hash.out ==> out;
}

/**
 * Computes the hash of an order state
 * Order Hash = Poseidon(e0, filled_sell, filled_buy, total_sell, total_buy)
 * e0: tokensell(32bits) | tokenbuy(32bits) | tokenbuy(2bits)
 * @input tokensell - {Uint32} - token to sell
 * @input tokenbuy - {Uint32} - token to buy
 * @input filled_sell - {Field} - token to sell
 * @input filled_buy - {Field} - token to sell
 * @input total_sell - {Field} - token to sell
 * @input total_buy - {Field} - token to sell
 * @input status - {Uint2} - order status
 * @output out - {Field} - resulting poseidon hash
 */
template HashOrder() {
    signal input tokensell;
    signal input tokenbuy;
    signal input filled_sell;
    signal input filled_buy;
    signal input total_sell;
    signal input total_buy;
    signal input order_id;

    signal output out;

    signal e0; // build e0 element
    e0 <== tokensell * (1 << 64) + tokenbuy * (1 << 32) + order_id;

    component hash = Poseidon(5);
    hash.inputs[0] <== e0;
    hash.inputs[1] <== filled_sell;
    hash.inputs[2] <== filled_buy;
    hash.inputs[3] <== total_sell;
    hash.inputs[4] <== total_buy;

    hash.out ==> out;
}

template CalculateGenesisOrderHash() {
    signal output out;
    component hashOrder = HashOrder();
    hashOrder.tokensell <== 0;
    hashOrder.tokenbuy <== 0;
    hashOrder.filled_sell <== 0;
    hashOrder.filled_buy <== 0;
    hashOrder.total_sell <== 0;
    hashOrder.total_buy <== 0;
    hashOrder.order_id <== 0;
    out <== hashOrder.out;
}
template CalculateGenesisOrderRoot(orderLevels) {
    signal output root;

    // There is a bug in circom native witness generator:
    // component of input size 0 cannot has another component of input size 0
    // so we cannot reuse `CalculateGenesisOrderHash` here...
    component hashOrder = HashOrder();
    hashOrder.tokensell <== 0;
    hashOrder.tokenbuy <== 0;
    hashOrder.filled_sell <== 0;
    hashOrder.filled_buy <== 0;
    hashOrder.total_sell <== 0;
    hashOrder.total_buy <== 0;
    hashOrder.order_id <== 0;

    component orderTree = CalculateRootFromRepeatedLeaves(orderLevels);
    orderTree.leaf <== hashOrder.out;

    root <== orderTree.root;
}
