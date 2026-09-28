# Pinned Chatwoot source

bookent.ai uses the Chatwoot Community Edition source, behind a private
bookent.ai adapter. This is not a Chatwoot Cloud account.

- Upstream repository: `https://github.com/chatwoot/chatwoot`
- Reviewed release: `v4.18.0`
- Source commit: `9f920b549c14491a4e587687a3eed5d21c6ccc7d`
- Container image: `chatwoot/chatwoot:v4.18.0`
- Licence: Chatwoot source outside `enterprise/` is MIT Expat; retain the
  upstream copyright and licence notices when copying or distributing source.

To inspect the exact source used by production:

```sh
git clone --depth 1 --branch v4.18.0 https://github.com/chatwoot/chatwoot.git
```
