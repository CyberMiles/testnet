#!/bin/bash
if [ "$1" == "-h" ]; then
  echo "Usage: `basename $0` [inst_count] [validator_count]"
  exit
fi

INST_COUNT=$1
VALIDATOR_COUNT=$2

cd "$(dirname "$0")"
BASE_DIR=$(dirname $PWD)/nodes

TRPCPORT=46657
TP2PPORT=46656
ERPCPORT=8545

# init params
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

echo "inst_count: $INST_COUNT, validator_count: $VALIDATOR_COUNT"
read -p "Press enter to continue..."

# init & config.toml
for i in `seq 1 $INST_COUNT`
do
  dir=$BASE_DIR/node$i

  # make node* directory if not exist
  mkdir -p $dir

  cd $dir

  rm -rf *
  travis node init --home .
  if [ $i -ne 1 ]; then
    seeds=`for ((i=1;i<=$VALIDATOR_COUNT;i++)) do echo node-$i:$TP2PPORT; done | sed '$!s/$/,/' | tr -d '\n'`
  else
    # seeds is empty string for the first instance
    seeds=""
  fi
  sed -i '' "s/seeds = \"\"/seeds = \"$seeds\"/g" ./config.toml
  sed -i '' "s/moniker = .*$/moniker = \"node-$i\"/g" ./config.toml
done

# genesis.json
cd $BASE_DIR

# combine the public keys of all validators, and set to genesis.json
validators=`for ((i=1;i<=$VALIDATOR_COUNT;i++)) do echo node$i/genesis.json; done \
  | xargs jq -r '.validators[0]' | sed '$!s/^}$/},/' |tr -d '\n'`
sed -i '' "s/\"validators\":\[.*\]/\"validators\":\[$validators\]/" node1/genesis.json
# set genesis_time, chain_id and validator.power
jq '(.genesis_time) |= "2018-03-15T00:00:00Z" | (.chain_id) |= "travis-1-dev" | (.validators[]|.power) |= 1000' \
  node1/genesis.json > tmp && mv tmp node1/genesis.json

# copy genesis.json from node1 to other nodes
for ((i=2;i<=$INST_COUNT;i++)) do echo node$i/genesis.json; done | xargs -n 1 cp node1/genesis.json
# format priv_validator.json
for ((i=1;i<=$INST_COUNT;i++)) do jq . node$i/priv_validator.json > tmp && mv tmp node$i/priv_validator.json; done
