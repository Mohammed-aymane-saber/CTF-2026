def mark_session_verified(client):
    with client.session_transaction() as sess:
        sess["admin_mfa_ok"] = {"uid": sess["id"], "h": sess.get("hash")}
