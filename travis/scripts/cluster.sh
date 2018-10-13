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
if [[ "$CHAIN_ID" == "staging" ]]; then
  VALS=(
    "0x631A728482047b34eee75286463d64aa99B11D11"
    "0x605bDc26fF6e23890d2b7241474a654A5d08269e"
    "0x329C77B8C64b353c62B286fc98269c616F58d683"
    "0x558cB42B69cE6984859C9ad60642Fa22bAc1CB03"
    "0xE4200dD69D4bc0B3BDcac8AD3fBd10a1347d8b3e"
    "0xf583A223D2F6767eba4f0C9f3B234c810eEA37C6"
    "0xf57A630F411Fb2E9113A4a1820643bbaEc737e4B"
    "0x31eE2d925C01986d7D7d736F4149A89062002cDE"
    "0xfB06872a6FE24Dbe1a483Dd370a6E0d5c9C43db0"
    "0x401e3b8743bAF8307b822329a78A85f4bB2001ee"
    "0xAb7E6F4c26BEcCD195De8399ac42Cd99eeBE4fAb"
    "0xda4951f0AfECE2140e09DC0dEAD4E90a7e658437"
    "0xaD122C3A8B14151FdfA459Ff7Da896b90C6220cD"
    "0xDB7c3D96A3C8fAaB2EeeeC6040Ca0410e14dd428"
    "0x55f2C6A8402ea6b990BeCdDA2c3bAe8a0f995Ca5"
    "0x488380230947285862AC8a5a0E035a2C22181245"
    "0x9C09f2Ec5c3668A9285A432EFC8e580402790680"
    "0x0Aa7f3Ed15664Dc899d4E2aA087878663de44130"
    "0x9Df3eD3958fcd1c54Ee13BA515987D30f985A977"
    "0x0e01EF26134Fc906b833FbEd6Ea36da2C90416B0"
    "0x23462375EdB7D033262bAa2c431912081a0452e6"
    "0x3DEb336F0EdeD1a0D5f5f4804386813A928fC340"
    "0xc2fb6025572541e6f7a84141B0E841FE1884d4Fb"
    "0xB0Bd389d56a85cfE5BB5824558D0833f47C8c051"
    "0x9fBA559484cB25630E0AA70Ba5FB9D7cE0162cF1")
elif [[ "$CHAIN_ID" == "mainnet" ]]; then
  VALS=(
    "0x631A728482047b34eee75286463d64aa99B11D11"
    "0x605bDc26fF6e23890d2b7241474a654A5d08269e"
    "0x329C77B8C64b353c62B286fc98269c616F58d683"
    "0x558cB42B69cE6984859C9ad60642Fa22bAc1CB03"
    "0xE4200dD69D4bc0B3BDcac8AD3fBd10a1347d8b3e"
    "0xf583A223D2F6767eba4f0C9f3B234c810eEA37C6"
    "0xf57A630F411Fb2E9113A4a1820643bbaEc737e4B")
else
  for filename in ./keystore/*;
  do
    VALS+=("0x${filename##*-}")
  done
fi

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
  TRAVIS_NODE="docker run --rm -v $dir:/travis cybermiles/travis:latest node"
  VM_GENESIS=""
  if [[ "$CHAIN_ID" == "stress" ]]; then
    cp ../../scripts/stress/vm-genesis.json .
    VM_GENESIS="--vm-genesis /travis/vm-genesis.json"
  elif [[ "$CHAIN_ID" == "staging" ]]; then
    curl https://raw.githubusercontent.com/CyberMiles/testnet/master/travis/init-staging/vm-genesis.json > ./vm-genesis.json
    VM_GENESIS="--vm-genesis /travis/vm-genesis.json"
  elif [[ "$CHAIN_ID" == "mainnet" ]]; then
    curl https://raw.githubusercontent.com/CyberMiles/testnet/master/travis/init-mainnet/vm-genesis.json > ./vm-genesis.json
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
  sed -i.bak "s/log_level = .*$/log_level = \"app:debug,state:info,*:error\"/" ./config/config.toml
  sed -i.bak "s/verbosity = .*$/verbosity = 3/" ./config/config.toml
  # vm rpc config
  if [[ "$CHAIN_ID" == "test" || "$CHAIN_ID" == "stress" || $i -eq 1 ]]; then
    sed -i.bak "s/rpcaddr = .*$/rpcaddr = \"0.0.0.0\"/" ./config/config.toml
    sed -i.bak "s/rpccorsdomain = .*$/rpccorsdomain = \"*\"/" ./config/config.toml
    sed -i.bak "s/rpcvhosts = .*$/rpcvhosts = \"*\"/" ./config/config.toml
  else
    sed -i.bak "s/rpcaddr = .*$/rpcaddr = \"localhost\"/" ./config/config.toml
    sed -i.bak "s/rpccorsdomain = .*$/rpccorsdomain = \"\"/" ./config/config.toml
    sed -i.bak "s/rpcvhosts = .*$/rpcvhosts = \"localhost\"/" ./config/config.toml
  fi
  if [[ "$CHAIN_ID" == "staging" ]]; then
    sed -i.bak "s/rpcapi = .*$/rpcapi = \"cmt,eth,net,web3\"/" ./config/config.toml
    # sed -i.bak "s/rpc = .*$/rpc = false/" ./config/config.toml
  elif [[ "$CHAIN_ID" == "mainnet" ]]; then
    sed -i.bak "s/rpcapi = .*$/rpcapi = \"cmt,eth,net,web3\"/" ./config/config.toml
    sed -i.bak "s/rpc = .*$/rpc = false/" ./config/config.toml
  fi
done

cd $BASE_DIR

# seeds in config.toml
SEED_STR=`IFS=,; echo "${SEEDS[*]}"`
for ((i=1;i<=$INST_COUNT;i++)) do
  sed -i.bak "s/seeds = \"\"/seeds = \"\"/g" node$i/config/config.toml
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
START=1
if [[ "$CHAIN_ID" == "staging" || "$CHAIN_ID" == "mainnet" ]]; then
  START=0
fi
for ((i=$START;i<$VALIDATOR_COUNT;i++)) do
  jq --arg IDX $i --arg VAL ${VALS[i]} \
  '(.validators[$IDX | tonumber ]|.address) |= $VAL' \
  node1/config/genesis.json > tmp && mv tmp node1/config/genesis.json
done
# set validator's max_amount & shares
if [[ "$CHAIN_ID" == "staging" ]]; then
  for ((i=0;i<$VALIDATOR_COUNT;i++)) do
    jq --arg IDX $i --arg VALNAME "val-"$((i+1)) \
    '(.validators[$IDX | tonumber ]|.max_amount) |= 20000000 | (.validators[$IDX | tonumber ]|.shares) |= 2000000
    | (.validators[$IDX | tonumber ]|.name) |= $VALNAME | (.validators[$IDX | tonumber]|.comp_rate) |= "11/20"' \
    node1/config/genesis.json > tmp && mv tmp node1/config/genesis.json
  done
elif [[ "$CHAIN_ID" == "mainnet" ]]; then
  for ((i=0;i<$VALIDATOR_COUNT;i++)) do
    jq --arg IDX $i --arg VALNAME "val-"$((i+1)) \
    '(.validators[$IDX | tonumber ]|.name) |= $VALNAME' \
    node1/config/genesis.json > tmp && mv tmp node1/config/genesis.json
  done
elif [[ "$CHAIN_ID" == "stress" ]]; then
  for ((i=0;i<$VALIDATOR_COUNT;i++)) do
    jq --arg IDX $i \
    '(.validators[$IDX | tonumber ]|.max_amount) |= 100000 | (.validators[$IDX | tonumber ]|.shares) |= 10000' \
    node1/config/genesis.json > tmp && mv tmp node1/config/genesis.json
  done
fi

# set max_vals=4, backup_vals=2 for testnet
if [[ "$CHAIN_ID" == "testnet" ]]; then
  jq '(.params.max_vals) |= 4 | (.params.backup_vals) |= 2' \
  node1/config/genesis.json > tmp && mv tmp node1/config/genesis.json
# set max_vals=19, backup_vals=5, cal_stake_interval=8640, cal_vp_interval=360, foundation_address= for staging
elif [[ "$CHAIN_ID" == "staging" ]]; then
  jq '(.params.max_vals) |= 19 | (.params.backup_vals) |= 5
  | (.params.cal_stake_interval) |= 8640 | (.params.cal_vp_interval) |= 1
  | (.params.foundation_address) |= "0xace111260c7e9a2e612e04686f5ad800fc7ca769"' \
  node1/config/genesis.json > tmp && mv tmp node1/config/genesis.json
# set max_vals=19, backup_vals=5, cal_stake_interval=8640, cal_vp_interval=360, foundation_address= for mainnet
elif [[ "$CHAIN_ID" == "mainnet" ]]; then
  jq '(.params.max_vals) |= 19 | (.params.backup_vals) |= 5
  | (.params.cal_stake_interval) |= 8640 | (.params.cal_vp_interval) |= 1
  | (.params.foundation_address) |= "0x8C88FED745bd859D5c78A3990C1d35bBBC3C2234"' \
  node1/config/genesis.json > tmp && mv tmp node1/config/genesis.json
# set max_vals=5, backup_vals=2, unstake_waiting_period=2, reward_interval=3, cal_stake_interval=60 for stress
elif [[ "$CHAIN_ID" == "stress" ]]; then
  jq '(.params.max_vals) |= 5 | (.params.backup_vals) |= 2
  | (.params.unstake_waiting_period) |= 2 | (.params.cal_vp_interval) |= 3 | (.params.cal_stake_interval) |= 60' \
  node1/config/genesis.json > tmp && mv tmp node1/config/genesis.json
fi

# copy genesis.json from node1 to other nodes
for ((i=2;i<=$INST_COUNT;i++)) do echo node$i/config/genesis.json; done | xargs -n 1 cp node1/config/genesis.json

# copy keystore to node1 if not staging or mainnet
if [[ "$CHAIN_ID" != "staging" || "$CHAIN_ID" != "mainnet" ]]; then
  dir=$(dirname $PWD)/scripts
  cp $dir/keystore/*.* node1/keystore
# no keystore on staging or mainnet
else
  rm node*/keystore/*
fi

# remove bak files generated by sed
rm $BASE_DIR/*/config/*.bak

# prepare init
cp -r $BASE_DIR/node${INST_COUNT} $BASE_DIR/init
rm -rf $BASE_DIR/init/keystore
rm $BASE_DIR/init/config/node_key.json
rm $BASE_DIR/init/config/priv_validator.json

# copy to directory nodes
DEST=$HOME/volumes/testnet/travis/nodes
echo "directory \"$DEST\" will be reset with \"$CHAIN_ID\""
read -p "Press enter to continue..."
cd $BASE_DIR
rm -rf $DEST && mkdir -p $DEST && cp -r . $DEST
