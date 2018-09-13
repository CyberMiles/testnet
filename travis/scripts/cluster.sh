#!/bin/bash
if [ "$1" == "-h" ]; then
  echo "Usage: `basename $0` chain_id [inst_count] [validator_count]"
  exit
fi

CHAIN_ID=$1
CHAIN_DATE=`date '+%Y-%m-%dT%H:%M:%SZ'`
INST_COUNT=$2
VALIDATOR_COUNT=$3

cd "$(dirname "$0")"

TRPCPORT=26657
TP2PPORT=26656
ERPCPORT=8545

# process keystore
VALS=()
for filename in ./keystore/*;
do
  VALS+=("0x${filename##*-}")
done

# init params
if [ -z "$CHAIN_ID" ]
  then
    echo "No chain_id supplied. "
    exit 1
fi
if [[ $VALIDATOR_COUNT -gt ${#VALS[@]} ]]; then
  echo "${#VALS[@]} validators at most. "
  exit
fi
if [[ (-z $INST_COUNT) || (! $INST_COUNT =~ ^[0-9]+$) ]]; then
  INST_COUNT=1
  VALIDATOR_COUNT=1
elif [[ ! $VALIDATOR_COUNT =~ ^[0-9]+$ ]]; then
  VALIDATOR_COUNT=$INST_COUNT
else
  if [[ $INST_COUNT -le 0 ]]; then
    echo "wrong inst_count"
    exit
  fi
  if [[ $INST_COUNT -lt $VALIDATOR_COUNT ]]; then
    VALIDATOR_COUNT=$INST_COUNT
  fi
fi

if [ $INST_COUNT -eq 0 ]; then
  exit
fi

BASE_DIR=$(dirname $PWD)/$CHAIN_ID
echo "directory \"$BASE_DIR\" will be reset with chain_id: $CHAIN_ID, inst_count: $INST_COUNT, validator_count: $VALIDATOR_COUNT"
read -p "Press enter to continue..."
rm -rf $BASE_DIR

# init & config.toml
SEEDS=()
for i in `seq 1 $INST_COUNT`
do
  dir=$BASE_DIR/node$i

  # make node* directory if not exist
  mkdir -p $dir && cd $dir && rm -rf *

  # travis node init
  TRAVIS_NODE="docker run --rm -v $dir:/travis ywonline/travis:latest node"
  VM_GENESIS=""
  if [[ "$CHAIN_ID" == "stress" ]]; then
    cp ../../scripts/stress/vm-genesis.json .
    VM_GENESIS="--vm-genesis /travis/vm-genesis.json"
  fi
  `$TRAVIS_NODE init --home /travis --env $CHAIN_ID $VM_GENESIS`

  if [[ $i -le $INST_COUNT ]]; then
    SEEDS+=("$(${TRAVIS_NODE} show_node_id --home /travis)@node-$i:$TP2PPORT")
  fi
  # test: replace first non-validator's node_key & priv_validator
  if [[ $i -eq $VALIDATOR_COUNT+1 && "$CHAIN_ID" == "test" ]]; then
    cp ../../scripts/candidate/* ./config
  fi
  # moniker, log_level, vm verbosity
  sed -i.bak "s/moniker = .*$/moniker = \"node-$i\"/" ./config/config.toml
  sed -i.bak "s/log_level = .*$/log_level = \"state:info,*:error\"/" ./config/config.toml
  sed -i.bak "s/verbosity = .*$/verbosity = 3/" ./config/config.toml
  # vm rpc config
  if [[ "$CHAIN_ID" == "test" || "$CHAIN_ID" == "stress" ]]; then
    sed -i.bak "s/rpcaddr = .*$/rpcaddr = \"0.0.0.0\"/" ./config/config.toml
    sed -i.bak "s/rpccorsdomain = .*$/rpccorsdomain = \"*\"/" ./config/config.toml
    sed -i.bak "s/rpcvhosts = .*$/rpcvhosts = \"*\"/" ./config/config.toml
  else
    sed -i.bak "s/rpcaddr = .*$/rpcaddr = \"localhost\"/" ./config/config.toml
    sed -i.bak "s/rpccorsdomain = .*$/rpccorsdomain = \"\"/" ./config/config.toml
    sed -i.bak "s/rpcvhosts = .*$/rpcvhosts = \"localhost\"/" ./config/config.toml
  fi
done

cd $BASE_DIR

# seeds in config.toml
SEED_STR=`IFS=,; echo "${SEEDS[*]}"`
for ((i=1;i<=$INST_COUNT;i++)) do
  sed -i.bak "s/seeds = \"\"/seeds = \"$SEED_STR\"/g" node$i/config/config.toml
  sed -i.bak "s/persistent_peers = \"\"/persistent_peers = \"$SEED_STR\"/g" node$i/config/config.toml
done

# genesis.json

# combine the public keys of all validators, and set to genesis.json
validators=`for ((i=1;i<=$VALIDATOR_COUNT;i++)) do echo node$i/config/genesis.json; done \
  | xargs jq -r '.validators[0]' | sed '$!s/^}$/},/' |tr -d '\n'`
echo [$validators] > validators.json
jq -M --argfile vals validators.json '.validators=$vals' \
  node1/config/genesis.json > tmp && mv tmp node1/config/genesis.json
rm validators.json

# set genesis_time, chain_id
jq --arg CHAIN_DATE $CHAIN_DATE --arg CHAIN_ID $CHAIN_ID \
  '(.genesis_time) |= $CHAIN_DATE | (.chain_id) |= $CHAIN_ID' \
  node1/config/genesis.json > tmp && mv tmp node1/config/genesis.json

# set validator's address
for ((i=1;i<$VALIDATOR_COUNT;i++)) do
  jq --arg IDX $i --arg VAL ${VALS[i]} \
  '(.validators[$IDX | tonumber ]|.address) |= $VAL' \
  node1/config/genesis.json > tmp && mv tmp node1/config/genesis.json
done
# set validator's max_amount & shares for stress
if [[ "$CHAIN_ID" == "stress" ]]; then
  for ((i=0;i<$VALIDATOR_COUNT;i++)) do
    jq --arg IDX $i \
    '(.validators[$IDX | tonumber ]|.max_amount) |= 100000 | (.validators[$IDX | tonumber ]|.shares) |= 10000' \
    node1/config/genesis.json > tmp && mv tmp node1/config/genesis.json
  done
fi

# set max_vals=19, backup_vals=5 for testnet
if [[ "$CHAIN_ID" == "testnet" ]]; then
  jq '(.params.max_vals) |= 19 | (.params.backup_vals) |= 5' \
  node1/config/genesis.json > tmp && mv tmp node1/config/genesis.json
# set max_vals=5, backup_vals=2, unstake_waiting_period=2, reward_interval=3, cal_stake_interval=60 for stress
elif [[ "$CHAIN_ID" == "stress" ]]; then
  jq '(.params.max_vals) |= 5 | (.params.backup_vals) |= 2 | (.params.unstake_waiting_period) |= 2 | (.params.cal_vp_interval) |= 3 | (.params.cal_stake_interval) |= 60' \
  node1/config/genesis.json > tmp && mv tmp node1/config/genesis.json
fi

# copy genesis.json from node1 to other nodes
for ((i=2;i<=$INST_COUNT;i++)) do echo node$i/config/genesis.json; done | xargs -n 1 cp node1/config/genesis.json

# copy keystore to nodes
for ((i=1;i<=$VALIDATOR_COUNT;i++)) do
  dir=$(dirname $PWD)/scripts
  cp $dir/keystore/*.* node$i/keystore
done

# non-validator
for ((i=$INST_COUNT;i>$VALIDATOR_COUNT;i--)) do
  dir=$BASE_DIR/node$i
  rm -rf $dir/keystore
done

# remove bak files generated by sed
rm $BASE_DIR/*/config/*.bak

# prepare init
cp -r $BASE_DIR/node${INST_COUNT} $BASE_DIR/init
rm -rf $BASE_DIR/init/keystore
rm $BASE_DIR/init/config/node_key.json
rm $BASE_DIR/init/config/priv_validator.json

# copy to directory nodes
echo "directory \"$(dirname "$BASE_DIR")/nodes\" will be reset with \"$CHAIN_ID\""
read -p "Press enter to continue..."
cd $BASE_DIR
rm -rf ../nodes && cp -r . ../nodes 
