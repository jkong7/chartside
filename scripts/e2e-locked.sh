#!/bin/zsh
LOCK=/tmp/chartside-e2e.lock
until mkdir $LOCK 2>/dev/null; do
  if [ -f $LOCK/pid ] && ! kill -0 $(cat $LOCK/pid) 2>/dev/null; then rm -rf $LOCK; continue; fi
  sleep 5
done
echo $$ > $LOCK/pid
trap 'rm -rf $LOCK' EXIT INT TERM
cd "$(dirname $0)/.." && npx playwright test "$@"
