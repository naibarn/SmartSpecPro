// Prevents additional console window on Windows in release, DO NOT REMOVE!!
// TEMPORARILY DISABLED FOR DEBUGGING
// #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    smartspecpro_lib::run()
}
