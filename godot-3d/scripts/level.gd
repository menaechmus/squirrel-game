extends Node3D
## Builds the park: boundary hedges, scattered scenery and acorns.
## The layout comes from a fixed seed, so it is the same every run.

const ACORN_SCENE := preload("res://scenes/acorn.tscn")
# Kenney Nature Kit (CC0). The models are tiny, so each kind gets a scale range.
const MODEL_DIR := "res://assets/nature/"
const TREES: Array[String] = ["tree_oak", "tree_default", "tree_detailed", "tree_fat",
		"tree_pineRoundA", "tree_pineRoundC", "tree_pineTallA"]
const ROCKS: Array[String] = ["rock_largeA", "rock_largeB", "rock_largeC", "rock_largeD"]
const STUMPS: Array[String] = ["stump_round", "stump_old"]
const BUSHES: Array[String] = ["plant_bush", "plant_bushLarge", "plant_bushDetailed"]
const SMALL_PLANTS: Array[String] = ["flower_redA", "flower_yellowA", "flower_purpleA",
		"mushroom_red", "mushroom_tanGroup"]

const LAYOUT_SEED := 20261011
const HALF_SIZE := 30.0
const SPAWN_CLEARING := 4.0
const TREE_COUNT := 40
const ROCK_COUNT := 10
const STUMP_COUNT := 6
const LOG_COUNT := 4
const BUSH_COUNT := 18
const SMALL_PLANT_COUNT := 30
const GROUND_ACORNS := 12
const ROCK_ACORNS := 2
const ACORN_HOVER := 0.5
const HEDGE_COLOR := Color(0.14, 0.34, 0.14)

var _rng := RandomNumberGenerator.new()
var _models := {}
var _fixed_materials := {}
# Occupied circles as (x, z, radius), so props don't overlap.
var _taken: Array[Vector3] = []

@onready var _sun: DirectionalLight3D = $Sun


func _ready() -> void:
	_rng.seed = LAYOUT_SEED
	if Game.is_mobile:
		# Phones render at high pixel density; trade sharpness and shadows for frame rate.
		_sun.shadow_enabled = false
		get_viewport().scaling_3d_scale = 0.7

	_build_boundary()
	_taken.append(Vector3(0.0, 0.0, SPAWN_CLEARING))

	# Stumps and rocks first: acorns sit on top of them.
	for i in STUMP_COUNT:
		var top := _add_solid(_pick(STUMPS), _free_spot(1.2), _rng.randf_range(3.0, 3.6))
		_add_acorn(top + Vector3.UP * ACORN_HOVER)
	for i in ROCK_COUNT:
		var top := _add_solid(_pick(ROCKS), _free_spot(2.2), _rng.randf_range(2.2, 3.0))
		if i < ROCK_ACORNS:
			_add_acorn(top + Vector3.UP * ACORN_HOVER)
	for i in LOG_COUNT:
		_add_solid("log", _free_spot(1.6), 3.5)
	for i in TREE_COUNT:
		_add_tree(_free_spot(1.4))
	for i in BUSH_COUNT:
		_add_decoration(_pick(BUSHES), _free_spot(1.0), _rng.randf_range(2.5, 3.5))
	for i in SMALL_PLANT_COUNT:
		_add_decoration(_pick(SMALL_PLANTS), _free_spot(0.3), _rng.randf_range(2.0, 3.0))
	for i in GROUND_ACORNS:
		_add_acorn(_free_spot(0.8) + Vector3.UP * ACORN_HOVER)


func _pick(names: Array[String]) -> String:
	return names[_rng.randi_range(0, names.size() - 1)]


## Pick a random ground position at least `radius` clear of everything placed so far.
func _free_spot(radius: float) -> Vector3:
	var limit := HALF_SIZE - 2.0
	var spot := Vector3.ZERO
	for attempt in 100:
		spot = Vector3(_rng.randf_range(-limit, limit), 0.0, _rng.randf_range(-limit, limit))
		var clear := true
		for other in _taken:
			if Vector2(spot.x - other.x, spot.z - other.y).length() < radius + other.z:
				clear = false
				break
		if clear:
			break
	_taken.append(Vector3(spot.x, spot.z, radius))
	return spot


func _build_boundary() -> void:
	var material := StandardMaterial3D.new()
	material.albedo_color = HEDGE_COLOR
	material.roughness = 1.0
	var length := HALF_SIZE * 2.0 + 4.0
	for side in 4:
		var along_x := side < 2
		var offset := (HALF_SIZE + 1.0) * (1.0 if side % 2 == 0 else -1.0)
		var body := StaticBody3D.new()
		body.position = Vector3(0.0, 0.0, offset) if along_x else Vector3(offset, 0.0, 0.0)
		add_child(body)

		# Visible hedge, with a much taller invisible wall so nothing can hop over.
		var hedge := BoxMesh.new()
		hedge.size = Vector3(length, 2.5, 2.0) if along_x else Vector3(2.0, 2.5, length)
		var hedge_instance := MeshInstance3D.new()
		hedge_instance.mesh = hedge
		hedge_instance.material_override = material
		hedge_instance.position = Vector3.UP * 1.25
		body.add_child(hedge_instance)

		var wall := BoxShape3D.new()
		wall.size = Vector3(hedge.size.x, 20.0, hedge.size.z)
		_add_collider(body, wall, Vector3.UP * 10.0)


func _add_tree(at: Vector3) -> void:
	var body := _add_body(at)
	_add_model(body, _pick(TREES), _rng.randf_range(3.5, 4.8))
	# Only the trunk blocks movement; the squirrel can run under the leaves.
	var trunk := CylinderShape3D.new()
	trunk.radius = 0.3
	trunk.height = 3.0
	_add_collider(body, trunk, Vector3.UP * 1.5)


## Adds a model the player can stand on, with collision matching its shape.
## Returns the position of its highest point.
func _add_solid(model_name: String, at: Vector3, model_scale: float) -> Vector3:
	var body := _add_body(at)
	var model := _add_model(body, model_name, model_scale)
	var top := 0.0
	for mesh_instance: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
		var to_body := Transform3D().scaled(Vector3.ONE * model_scale) * mesh_instance.transform
		var shape: ConvexPolygonShape3D = mesh_instance.mesh.create_convex_shape()
		var points := shape.points
		for i in points.size():
			points[i] = to_body * points[i]
			top = maxf(top, points[i].y)
		shape.points = points
		_add_collider(body, shape, Vector3.ZERO)
	return at + Vector3.UP * top


func _add_decoration(model_name: String, at: Vector3, model_scale: float) -> void:
	var model := _add_model(self, model_name, model_scale)
	model.position = at
	model.rotation.y = _rng.randf_range(0.0, TAU)


func _add_acorn(at: Vector3) -> void:
	var acorn := ACORN_SCENE.instantiate()
	acorn.position = at
	add_child(acorn)


func _add_body(at: Vector3) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.position = at
	body.rotation.y = _rng.randf_range(0.0, TAU)
	add_child(body)
	return body


func _add_model(parent: Node3D, model_name: String, model_scale: float) -> Node3D:
	if not _models.has(model_name):
		_models[model_name] = load(MODEL_DIR + model_name + ".glb")
	var model: Node3D = _models[model_name].instantiate()
	model.scale = Vector3.ONE * model_scale
	parent.add_child(model)
	for mesh_instance: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
		for surface in mesh_instance.mesh.get_surface_count():
			_fix_material(mesh_instance.mesh.surface_get_material(surface) as BaseMaterial3D)
	return model


## The kit's files mark every material as fully metallic (so they mirror the sky)
## and store display colours where glTF expects linear ones (so they import too
## bright). Materials are shared between instances, so each is corrected once.
func _fix_material(material: BaseMaterial3D) -> void:
	if material == null or _fixed_materials.has(material):
		return
	_fixed_materials[material] = true
	material.metallic = 0.0
	var color := material.albedo_color.srgb_to_linear()
	# The kit's foliage is teal; pull it towards leaf green to suit a park.
	if color.h > 0.38 and color.h < 0.6:
		color = Color.from_hsv(color.h - 0.14, color.s * 0.85, color.v * 0.8)
	material.albedo_color = color


func _add_collider(parent: Node3D, shape: Shape3D, offset: Vector3) -> void:
	var collider := CollisionShape3D.new()
	collider.shape = shape
	collider.position = offset
	parent.add_child(collider)
