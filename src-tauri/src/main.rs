// EVE — desktop shell.
//
// Everything EVE actually does happens in JavaScript: the network, the vision,
// the learning. This is the window that holds it, and it exists for two
// practical reasons rather than for its own sake.
//
// A camera. Browsers refuse getUserMedia unless the page is on a secure origin,
// which rules out reaching a Raspberry Pi over plain http from another machine.
// The webview here serves from a secure origin of its own, so the camera simply
// works — no certificate, no warning, nothing to accept.
//
// A file. Something you can hand to someone, that appears in the Start Menu and
// opens in its own window, with no browser and no server to start first.
//
// Nothing in this file talks to the network, and nothing in the app it hosts
// does either.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    eve_lib::run()
}
