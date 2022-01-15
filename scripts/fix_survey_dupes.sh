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

function check_dep() {
	local dep="$1"
	if [ ! -x "$(command -v "$dep")" ]
	then
		err "missing dependency $(tput bold)$dep$(tput sgr0)"
		exit 1
	fi
}
check_dep xxd
check_dep jq
check_dep base64
check_dep sqlite3
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
	# start counting from 0
	num="$((num - 1))"
	range="$(eval "echo {0..$num}")"
	# correct="$(echo -n "$correct" | xxd -p)"
	misspell="${misspell//\'/\'\'}"
	correct="${correct//\'/\'\'}"
	if [ ! -f db/survey.db ]
	then
		exit 1
	fi
	for i in $range
	do
		# echo ".param set :spell $misspell"
		# echo "UPDATE Answers SET question$i = x'$correct' WHERE question$i = :spell;"
		echo "UPDATE Answers SET question$i = '$correct' WHERE question$i = '$misspell';"
	done >> ./db/tmp.sql
	sqlite3 ./db/survey.db < ./db/tmp.sql
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

	:> ./db/tmp.sql
	while read -r row
	do
		correct="$(echo "$row" | base64 --decode | jq -r 'keys[0]')"
		log "checking misspellings of '$correct' .."
		while read -r misspell
		do
			update_rows "$correct" "$misspell" "$num_questions"
		done < <(echo "$row" | base64 --decode | jq -r '.[][]')
	done < <(jq -r '.[] | @base64' survey_fix.json)
}

main

