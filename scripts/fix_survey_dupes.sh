#!/bin/bash
# script to make sure all use the same spelling
# takes a misspelling dataset as input
# and runs sql querys to make sure the survey result
# is counted properly
#
# example:
# 'ChillerDragon' and 'ChillerDragon.*' got votes so each have 1 vote
# dataset contains mapping from 'ChillerDragon.*' to 'ChillerDragon'
# after script run the db is left with 2 votes for 'ChillerDragon'

function err() {
	printf "[-] %s\n" "$1"
}

function log() {
	printf "[*] %s\n" "$1"
}

if [ ! -x "$(command -v jq)" ]
then
	err "missing dependency $(tput bold)jq$(tput sgr0)"
	exit 1
fi
if [ ! -x "$(command -v base64)" ]
then
	err "missing dependency $(tput bold)base64$(tput sgr0)"
	exit 1
fi
if [ ! -x "$(command -v sqlite3)" ]
then
	err "missing dependency $(tput bold)sqlite3$(tput sgr0)"
	exit 1
fi
if [ ! -f db/survey.db ]
then
	err "db/survey.db not found"
	exit 1
fi

if [ ! -f survey_fix.json ]
then
	err "file not found 'survey_fix.json'"
	err "expected a misspelling file in the following format:"
	cat <<- 'EOF'
	[
	  {
	    "correct spelling": [
	      "list",
	      "of",
	      "similar versions"
	    ]
	  },
	  {
	    "Itube": [
	      "OwoTube",
	      "`Itube`"
	    ]
	  },
	  {
	    "ChillerDragon": [
	      "ChillerDragon.*"
	    ]
	  }
	]
	EOF
fi

function update_rows() {
	local correct="$1"
	local misspell="$2"
	local num="$3"
	local range
	range="$(eval "echo {0..$num}")"
	for i in $range
	do
		echo "UPDATE Answers SET question$i = '$correct' WHERE question$i = '$misspell'"
	done
}

function get_num_questions() {
	if [ ! -f db/survey.db ]
	then
		exit 1
	fi
	sqlite3 db/survey.db < <(echo ".schema") | grep -c question
}

function main() {
	local num_questions
	local correct
	local row
	local misspell
	if ! num_questions="$(get_num_questions)"
	then
		err "failed to compute amount of questions"
		exit 1
	fi
	if [[ ! "$num_questions" =~ ^[0-9]+$ ]]
	then
		err "invalid amount of questions: $num_questions"
		exit 1
	fi

	while read -r row
	do
		correct="$(echo "$row" | base64 --decode | jq -r 'keys[0]')"
		echo "$correct"
		while read -r misspell
		do
			update_rows "$correct" "$misspell" "$num_questions"
		done < <(echo "$row" | base64 --decode | jq -r '.[][]')
	done < <(jq -r '.[] | @base64' survey_fix.json)
}

main

