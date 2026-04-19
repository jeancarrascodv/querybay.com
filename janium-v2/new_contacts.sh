#!/usr/bin/env bash

ID="${1}"
if [ -z "$ID" ]; then
  echo "Usage: $0 <team_id>"
  exit 1
fi

query='operations={ "query": "mutation ($file: Upload!) {team(id: \"'${ID}'\") {uploadContactListCsv (listName: \"testlist\", csvFile: $file){contactList{id name} contacts{id firstName} companies{id name} rejectedContacts {matchedIds message contactRow {bestEmail firstName}}}}}", "variables": {"file": null}}'

curl -k https://localhost:443 \
  --form "${query}" \
  --form 'map={ "0": ["variables.file"]}' \
  --form '0=@../../new_contacts.csv'