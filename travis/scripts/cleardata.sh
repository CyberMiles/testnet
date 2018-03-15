#!/bin/bash
if [ "$1" == "-h" ]; then
  echo "Usage: `basename $0` [node_from] [node_to]"
  exit
fi

NODE_FROM=$1
NODE_TO=$2

cd "$(dirname "$0")"
BASE_DIR=$(dirname $PWD)/nodes

# init params
if [[ (-z $NODE_FROM) || (! $NODE_FROM =~ ^[0-9]+$) ]]; then
  NODE_FROM=1
  NODE_TO=1
elif [[ ! $NODE_TO =~ ^[0-9]+$ ]]; then
  NODE_TO=$NODE_FROM
else
  if [[ $NODE_FROM -le 0 ]]; then
    echo "wrong node_from"
    exit
  fi
  if [[ $NODE_TO -lt $NODE_FROM ]]; then
    NODE_TO=$NODE_FROM
  fi
fi

if [ $NODE_FROM -eq 0 ]; then
  exit
fi

echo "node_from: $NODE_FROM, node_to: $NODE_TO"
read -p "WARNING!!! All data will be lost!!! Press enter to continue..."

remove_a_node() {
  node=$1
  echo "clear data for $node..."
  cd $BASE_DIR
  # remove local db
  rm -rf $node/vm $node/data
  # copy genesis vm
  cp -r ../scripts/vm $node/
  # set last_height, last_round, last_step=0, last_signature=null, remove last_signbytes
  jq '(.last_height) |= 0 | (.last_round) |= 0 | (.last_step) |= 0 | (.last_signature) |= null | del(.last_signbytes)' \
    $node/priv_validator.json > tmp && mv tmp $node/priv_validator.json
  echo "done."
}

for i in `seq $NODE_FROM $NODE_TO`
do
  node_dir=node$i
  remove_a_node $node_dir
done
