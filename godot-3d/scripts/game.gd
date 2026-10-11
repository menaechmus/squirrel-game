extends Node
## Global game state: acorn count, timer and the menu / playing / won flow.

signal acorns_changed(collected: int, total: int)
signal state_changed(state: State)
signal touch_detected

enum State { MENU, PLAYING, WON }

var state := State.MENU
var total := 0
var collected := 0
var elapsed := 0.0
var is_mobile := false
var touch_seen := false


func _ready() -> void:
	is_mobile = OS.has_feature("mobile") or OS.has_feature("web_android") or OS.has_feature("web_ios")
	touch_seen = is_mobile
	# Dev shortcut: `godot -- --autostart` skips the start screen.
	if "--autostart" in OS.get_cmdline_user_args():
		start.call_deferred()


func _process(delta: float) -> void:
	if state == State.PLAYING:
		elapsed += delta


func _input(event: InputEvent) -> void:
	# Touch laptops report as desktop; show the on-screen controls once touched.
	if not touch_seen and event is InputEventScreenTouch:
		touch_seen = true
		touch_detected.emit()


func register_acorn() -> void:
	total += 1
	acorns_changed.emit(collected, total)


func collect_acorn() -> void:
	collected += 1
	acorns_changed.emit(collected, total)
	if collected >= total:
		_set_state(State.WON)


func start() -> void:
	elapsed = 0.0
	_set_state(State.PLAYING)


func restart() -> void:
	total = 0
	collected = 0
	get_tree().reload_current_scene()
	start()


func _set_state(new_state: State) -> void:
	state = new_state
	if state == State.PLAYING and not is_mobile:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	else:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	state_changed.emit(state)
