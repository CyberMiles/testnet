#!/bin/bash
if [ "$1" == "-h" ]; then
  echo "Usage: `basename $0` chain_id"
  exit
fi

# init params
CHAIN_ID=$1
if [ -z "$CHAIN_ID" ]
  then
    echo "No chain_id supplied. "
    exit 1
fi

cd "$(dirname "$0")"
BASE_DIR=$(dirname $PWD)/$CHAIN_ID

echo "directory \"$(dirname "$BASE_DIR")/nodes\" will be reset with \"$CHAIN_ID\""
read -p "Press enter to continue..."

cd $BASE_DIR
rm -rf ../nodes && cp -r . ../nodes 
