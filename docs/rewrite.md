# Rewrite Reset Notes

## Preserved legacy locations
- Backup tag: `pre-rewrite-ms22`
- Backup branch: `backup/pre-rewrite-ms22`
- Legacy branch: `legacy/master`

## Inspect old code
- Checkout legacy branch: `git checkout legacy/master`
- Or inspect the backup tag: `git checkout pre-rewrite-ms22`

## Restore old mainline
- To restore old line locally: `git checkout legacy/master`
- To repoint master to legacy state (local): `git checkout master && git reset --hard legacy/master`
- To repoint on remote (when `origin` is configured): push `legacy/master` to `master` with force-with-lease.

## Why orphan branch
An orphan branch creates a brand-new root commit with no parent history in the branch itself, while preserving full repository history through tags and backup/legacy branches.
