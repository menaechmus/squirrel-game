extends Control
## On-screen controls: a floating joystick on the left half, a jump button
## bottom-right, and dragging anywhere else orbits the camera.

const JOY_RADIUS := 110.0
const KNOB_RADIUS := 44.0
const JUMP_RADIUS := 85.0
const LOOK_SENSITIVITY := 0.006
const MOVE_ACTIONS: Array[StringName] = [&"move_left", &"move_right", &"move_forward", &"move_back"]

var _joy_touch := -1
var _joy_origin := Vector2.ZERO
var _joy_vector := Vector2.ZERO
var _jump_touch := -1
var _look_touch := -1


func _ready() -> void:
	Game.state_changed.connect(_on_state_changed)
	Game.touch_detected.connect(_refresh)
	resized.connect(queue_redraw)
	_refresh()


func _refresh() -> void:
	visible = Game.touch_seen and Game.state == Game.State.PLAYING
	queue_redraw()


func _on_state_changed(_state: Game.State) -> void:
	_release_all()
	_refresh()


func _input(event: InputEvent) -> void:
	if not visible:
		return
	if event is InputEventScreenTouch:
		var pos: Vector2 = make_input_local(event).position
		if event.pressed:
			if _jump_touch == -1 and pos.distance_to(_jump_center()) <= JUMP_RADIUS * 1.3:
				_jump_touch = event.index
				Input.action_press(&"jump")
			elif _joy_touch == -1 and pos.x < size.x * 0.5:
				_joy_touch = event.index
				_joy_origin = pos
			elif _look_touch == -1:
				_look_touch = event.index
		elif event.index == _jump_touch:
			_jump_touch = -1
			Input.action_release(&"jump")
		elif event.index == _joy_touch:
			_joy_touch = -1
			_set_joystick(Vector2.ZERO)
		elif event.index == _look_touch:
			_look_touch = -1
		queue_redraw()
	elif event is InputEventScreenDrag:
		var local: InputEventScreenDrag = make_input_local(event)
		if event.index == _joy_touch:
			_set_joystick(((local.position - _joy_origin) / JOY_RADIUS).limit_length(1.0))
			queue_redraw()
		elif event.index == _look_touch:
			var player := get_tree().get_first_node_in_group(&"player")
			if player:
				player.rotate_camera(local.relative * LOOK_SENSITIVITY)


func _draw() -> void:
	var base := _joy_origin if _joy_touch != -1 else _joy_rest()
	draw_circle(base, JOY_RADIUS, Color(1, 1, 1, 0.12))
	draw_arc(base, JOY_RADIUS, 0.0, TAU, 48, Color(1, 1, 1, 0.5), 3.0, true)
	draw_circle(base + _joy_vector * JOY_RADIUS, KNOB_RADIUS, Color(1, 1, 1, 0.5))

	var jump := _jump_center()
	draw_circle(jump, JUMP_RADIUS, Color(1, 1, 1, 0.45 if _jump_touch != -1 else 0.2))
	draw_arc(jump, JUMP_RADIUS, 0.0, TAU, 48, Color(1, 1, 1, 0.5), 3.0, true)
	draw_string(get_theme_default_font(), jump + Vector2(-JUMP_RADIUS, 10.0), "JUMP",
			HORIZONTAL_ALIGNMENT_CENTER, JUMP_RADIUS * 2.0, 28)


func _joy_rest() -> Vector2:
	return Vector2(170.0, size.y - 170.0)


func _jump_center() -> Vector2:
	return size - Vector2(150.0, 150.0)


## Feed the stick into the same actions the keyboard uses.
func _set_joystick(value: Vector2) -> void:
	_joy_vector = value
	var strengths := [-value.x, value.x, -value.y, value.y]
	for i in MOVE_ACTIONS.size():
		if strengths[i] > 0.0:
			Input.action_press(MOVE_ACTIONS[i], strengths[i])
		else:
			Input.action_release(MOVE_ACTIONS[i])


func _release_all() -> void:
	_joy_touch = -1
	_jump_touch = -1
	_look_touch = -1
	_joy_vector = Vector2.ZERO
	for action in MOVE_ACTIONS:
		Input.action_release(action)
	Input.action_release(&"jump")
