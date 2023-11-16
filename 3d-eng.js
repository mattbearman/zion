// JS rounding errors mean things that should be treated as zero aren't always, so use this hack
const ZERO = 0.00001;
const TARGET_FPS = 60;
const TARGET_FRAME_TIME = 1000 / TARGET_FPS;

var frame_counter = 0;

var pressed_keys = {};

var log_frame = false;

const fps_display = document.createElement('span');
fps_display.style.position = 'absolute';
fps_display.style.top = '10px';
fps_display.style.right = '10px';
document.body.appendChild(fps_display);

var layers = {
  world_grid: {
    canvas: document.createElement("canvas"),
    context: null,
    size: 1,
    zIndex: 200,
    bitmap: null
  },
  map_grid: {
    canvas: document.createElement("canvas"),
    context: null,
    size: 0.25,
    zIndex: 150
  },
  debug: {
    canvas: document.createElement("canvas"),
    context: null,
    size: 1,
    zIndex: 100
  },
  map: {
    canvas: document.createElement("canvas"),
    context: null,
    size: 0.25,
    zIndex: 50
  },
  world: {
    canvas: document.createElement("canvas"),
    context: null,
    size: 1,
    zIndex: 0
  }
};

const drawable_width = 800;
const drawable_height = 600;

for(key in layers) {
  var layer = layers[key];

  layer.context = layer.canvas.getContext('2d');

  layer.canvas.width = Math.round(drawable_width * layer.size);
  layer.canvas.height = Math.round(drawable_height * layer.size);

  layer.canvas.style.position = 'absolute';
  layer.canvas.style.top = 0;
  layer.canvas.style.left = 0;
  layer.canvas.style.zIndex = layer.zIndex;

  document.body.appendChild(layer.canvas);
}

// map grid
layers.map_grid.context.strokeStyle = "rgb(50, 50, 50)";

layers.map_grid.context.beginPath();

layers.map_grid.context.moveTo(0, layers.map_grid.canvas.height / 2);
layers.map_grid.context.lineTo(layers.map_grid.canvas.width, layers.map_grid.canvas.height / 2);

layers.map_grid.context.moveTo(layers.map_grid.canvas.width / 2, 0);
layers.map_grid.context.lineTo(layers.map_grid.canvas.width / 2, layers.map_grid.canvas.height);

layers.map_grid.context.stroke();
layers.map_grid.context.closePath();


// world grid
layers.world_grid.canvas.style.display = 'none';
layers.world_grid.context.strokeStyle = "rgb(150, 150, 150)";

layers.world_grid.context.beginPath();

for (var i = 0.1; i < 1; i += 0.1) {
  layers.world_grid.context.moveTo(layers.world_grid.canvas.width * i, 0);
  layers.world_grid.context.lineTo(layers.world_grid.canvas.width * i, layers.world_grid.canvas.height);

  layers.world_grid.context.moveTo(0, layers.world_grid.canvas.height * i);
  layers.world_grid.context.lineTo(layers.world_grid.canvas.width, layers.world_grid.canvas.height * i);
}

layers.world_grid.context.stroke();
layers.world_grid.context.closePath();

const fov = 90; // degrees

// Calculate the tangent of half the field of view, so that trig can be used to calculate the ratio
// between distance from view and viewed width. Needs to be halved to make a right angle triangle with known
// angle and adjacent. Convert to radians as that's what JS expects
var half_fov_rad = (fov / 2) * (Math.PI / 180);
var half_fov_tan = Math.tan(half_fov_rad);

var aspect_ratio = drawable_width / drawable_height;

var dist_to_view = 1;

var width_of_view = dist_to_view * half_fov_tan * 2;
var height_of_view = width_of_view / aspect_ratio;

var camera = {
  x: 0,
  y: 1.75,
  z: 1,
  yaw: 0,
  pitch: 0,
  roll: 0
};

const sun = {
  x: -2, y: 20, z: -5
};

const cube = {
  origin: { x: 0, y: 2, z: 10 },
  polygons: [
    {
      colour: [255, 0, 0],
      points: [
        // floor 1
        { x: -1, y: -1, z: -1 },
        { x: -1, y: -1, z: 1 },
        { x: 1, y: -1, z: 1 }
      ]
    },
    {
      colour: [255, 0, 0],
      points: [
        // floor 2
        { x: -1, y: -1, z: -1 },
        { x: 1, y: -1, z: 1 },
        { x: 1, y: -1, z: -1 }
      ]
    },
    {
      colour: [155, 0, 0],
      points: [
        // left wall 1
        { x: -1, y: -1, z: -1 },
        { x: -1, y: 1, z: -1 },
        { x: -1, y: 1, z: 1 },
      ]
    },
    {
      colour: [155, 0, 0],
      points: [
        // left wall 2
        { x: -1, y: -1, z: -1 },
        { x: -1, y: 1, z: 1 },
        { x: -1, y: -1, z: 1 },
      ]
    },
    {
      colour: [55, 0, 0],
      points: [
        // roof 1
        { x: -1, y: 1, z: -1 },
        { x: -1, y: 1, z: 1 },
        { x: 1, y: 1, z: 1 }
      ]
    },
    {
      colour: [55, 0, 0],
      points: [
        // roof 2
        { x: -1, y: 1, z: -1 },
        { x: 1, y: 1, z: 1 },
        { x: 1, y: 1, z: -1 },
      ]
    },
    {
      colour: [155, 0, 0],
      points: [
        // right wall 1
        { x: 1, y: -1, z: -1 },
        { x: 1, y: 1, z: -1 },
        { x: 1, y: 1, z: 1 },
      ]
    },
    {
      colour: [155, 0, 0],
      points: [
        // right wall 2
        { x: 1, y: -1, z: -1 },
        { x: 1, y: 1, z: 1 },
        { x: 1, y: -1, z: 1 },
      ]
    }
  ]
};

function render_scene() {
  const start_time = performance.now();

  layers.debug.context.clearRect(0, 0, layers.debug.canvas.width, layers.debug.canvas.height);
  layers.map.context.clearRect(0, 0, layers.map.canvas.width, layers.map.canvas.height);
  layers.world.context.clearRect(0, 0, layers.world.canvas.width, layers.world.canvas.height);

  layers.world.context.fillStyle = "rgb(200, 200, 200)";
  layers.world.context.fillRect(0, 0, layers.world.canvas.width, layers.world.canvas.height);

  // map bg
  layers.map.context.fillStyle = "rgb(150, 150, 150)";
  layers.map.context.fillRect(0, 0, layers.map.canvas.width, layers.map.canvas.height);

  layers.world.bitmap = layers.world.context.getImageData(0, 0, layers.world.canvas.width, layers.world.canvas.height);

  render_object(cube);

  frame_counter++;

  layers.world.context.putImageData(layers.world.bitmap, 0, 0);

  log_frame = false;

  const execution_time = performance.now() - start_time;

  setTimeout(render_scene, Math.max(TARGET_FRAME_TIME - execution_time, 0));
}

function render_object(object) {
  for (var i = 0; i < object.polygons.length; i++) {
    const triangle = object.polygons[i];
    var localised_triangle = [];

    for (var j = 0; j < triangle.points.length; j++) {
      var point = triangle.points[j];

      point = globalize_point(point, object.origin);

      localised_triangle.push(localise_point(point, camera));
    }

    // sort by localized Z descending, so points behind camera will be last
    localised_triangle.sort((p1, p2) => p1.z < p2.z);

    var projected_triangle = [];

    // cull triangles that are entirely behind the camera
    // TODO: cull any that are completely outside the viewable area, instead of just behind the camera
    if (localised_triangle[0].z < ZERO) {
      // culled
    }
    else {
      for (var j = 0; j < localised_triangle.length; j++) {
        if (projected_triangle.length < 3) {
          var point = localised_triangle[j];

          if (point.z > ZERO) {
            projected_triangle.push(project_point(point));
          }
          else {
            // if this is the second point, then 2 out of 3 points are behind the camera, so the triangle can be truncated to in front of the camera
            if (j == 1) {
              projected_triangle.push(project_point(visible_point_on_line(localised_triangle[0], point)));
              projected_triangle.push(project_point(visible_point_on_line(localised_triangle[0], localised_triangle[2])));

              // no need for the last iteration, as the triangle is now projected
              j = 3;
            }

            // otherwise create an extra triangle to essentially make a quad
            else if (j == 2) {
              const extrapolated_projected_points = [
                project_point(visible_point_on_line(localised_triangle[0], point)),
                project_point(visible_point_on_line(localised_triangle[1], point))
              ]

              projected_triangle.push(extrapolated_projected_points[0]);

              const extra_projected_triangle = [
                extrapolated_projected_points[0],
                projected_triangle[1],
                extrapolated_projected_points[1],
              ]

              draw_triangle(extra_projected_triangle, layers.world, triangle.colour);
            }
          }
        }
      }
    }

    if (projected_triangle.length == 3) {
      draw_triangle(projected_triangle, layers.world, triangle.colour);
    }

    // map polygons
    layers.map.context.fillStyle = "rgb(200, 0, 0)";

    layers.map.context.beginPath();

    for (j = 0; j < localised_triangle.length; j++) {
      var x = (localised_triangle[j].x * 10) + (layers.map.canvas.width / 2);
      var z = (layers.map.canvas.height / 2) - (localised_triangle[j].z * 10);

      if (j === 0) {
        layers.map.context.moveTo(x, z);
      }
      else {
        layers.map.context.lineTo(x, z);
      }
    }

    layers.map.context.fill();
    layers.map.context.closePath();
  }
}

function globalize_point(point, origin) {
  return {
    x: point.x + origin.x,
    y: point.y + origin.y,
    z: point.z + origin.z
  }
}

function localise_point(point, viewer) {
  var x_distance = point.x - viewer.x;
  var y_distance = point.y - viewer.y;
  var z_distance = point.z - viewer.z;

  // translate point based on viewer angles
  // x
  // calculate angle from world to point
  var tan_world_angle_to_point = x_distance / z_distance;
  if (isNaN(tan_world_angle_to_point)) {
    tan_world_angle_to_point = 0;
  }
  var world_angle_to_point = Math.atan(tan_world_angle_to_point);

  // calculate distance from viewer to point (hypotenuse)
  // use sin if z distance is 0, otherwise hypotenuse will be 0
  // if (pretty_much_zero(z_distance)) {
  if (z_distance < ZERO) {
    var dist_to_point = x_distance / Math.sin(world_angle_to_point);
  }
  else {
    var dist_to_point = z_distance / Math.cos(world_angle_to_point);
  }

  if (isNaN(dist_to_point)) {
    dist_to_point = 0;
  }

  // calculate angle between viewer and point
  var local_angle_to_point = world_angle_to_point - camera.yaw;

  var local_x_dist = Math.sin(local_angle_to_point) * dist_to_point;
  var local_z_dist = Math.cos(local_angle_to_point) * dist_to_point;

  return {
    x: local_x_dist,
    y: y_distance, // FIX THIS!
    z: local_z_dist
  }
}

function project_point(point) {
  var proj_x = point.x * (dist_to_view / point.z);
  var proj_y = point.y * (dist_to_view / point.z);

  return {
    x: proj_x,
    y: -proj_y
  }
}

function visible_point_on_line(from, to) {
  // extrapolate a point on the lines between from and to, that has a positive Z
  // and is therefore visible
  const extrapolation_line = {
    x: from.x - to.x,
    y: from.y - to.y,
    z: from.z - to.z
  };

  // calculate the ratio between to and from (in that order) that lands on Z of 0.1 (just in front of camera)
  const ratio = (0.1 - to.z) / extrapolation_line.z;

  // find a z value between the point to extrapolate from and the camera pane
  var extrapolated = {
    x: to.x + (extrapolation_line.x * ratio),
    y: to.y + (extrapolation_line.y * ratio),
    z: to.z + (extrapolation_line.z * ratio)
  }

  return extrapolated;
}

function light_face(triangle, light) {
  // find centre of triangle - average?
  const triangle_centre = {
    x: (triangle[0].x + triangle[1].x + triangle[2].x) / 3,
    y: (triangle[0].y + triangle[1].y + triangle[2].y) / 3,
    z: (triangle[0].z + triangle[1].z + triangle[2].z) / 3
  }

  // calculate triangle's normal at centre

  // calculate angle between light and centre, and normal
  // use cosine, as and angle of zero means full intensity, and cos(0) = 1
}

function draw_triangle(triangle, layer, colour) {
  // Turn relative point coords to pixel coords
  for (var i = 0; i < triangle.length; i++) {
    triangle[i] = projected_relative_to_canvas(triangle[i], layer.canvas);
  }

  // sort points so left most is first
  triangle.sort((a, b) => a.x > b.x);

  // TODO: Handle 2 points with same min x (go right to left instead?)

  const ratio_0_to_1 = (triangle[1].y - triangle[0].y) / (triangle[1].x - triangle[0].x);
  const ratio_0_to_2 = (triangle[2].y - triangle[0].y) / (triangle[2].x - triangle[0].x);
  const ratio_1_to_2 = (triangle[2].y - triangle[1].y) / (triangle[2].x - triangle[1].x);

  for (var x = Math.max(0, triangle[0].x); x < Math.min(triangle[1].x, layer.canvas.width); x++) {
    const x_offset = x - triangle[0].x;

    var y_limits = [
      Math.floor(triangle[0].y + (x_offset * ratio_0_to_1)),
      Math.floor(triangle[0].y + (x_offset * ratio_0_to_2))
    ].sort((a, b) => a > b);

    y_limits[0] = Math.max(0, y_limits[0]);
    y_limits[1] = Math.min(y_limits[1], layer.canvas.height);

    for (var y = y_limits[0]; y < y_limits[1]; y++) {
      draw_pixel(layer, { x: x, y: y }, 1, colour);
    }
  }

  for (var x = Math.max(0, triangle[1].x); x < Math.min(triangle[2].x, layer.canvas.width); x++) {
    var y_limits = [
      Math.floor(triangle[0].y + ((x - triangle[0].x) * ratio_0_to_2)),
      Math.floor(triangle[1].y + ((x - triangle[1].x) * ratio_1_to_2))
    ].sort((a, b) => a > b);

    y_limits[0] = Math.max(0, y_limits[0]);
    y_limits[1] = Math.min(y_limits[1], layer.canvas.height);

    for (var y = y_limits[0]; y < y_limits[1]; y++) {
      draw_pixel(layer, { x: x, y: y }, 1, colour);
    }
  }
}

function draw_pixel(layer, point, relative_z, colour) {
  // TODO: check z buffer

  if (point.x < 0 || point.y < 0 || point.x > layer.canvas.width || point.y > layer.canvas.width) {
    return;
  }

  const data_start = ((point.y * layer.canvas.width) + point.x) * 4; // 4 as each pixel has 4 elements - RGBA
  layer.bitmap.data[data_start] = colour[0];
  layer.bitmap.data[data_start + 1] = colour[1];
  layer.bitmap.data[data_start +2] = colour[2];
  layer.bitmap.data[data_start] = 255;
}

// function two_points_to_line(point_a, point_b) {
//   const x = point_a.x - point_b.x;
//   const y = point_a.y - point_b.y;

//   const multiplier = y / x;
//   const offset = point_a.y - (multiplier * point_a.x);

//   return {
//     multiplier: multiplier,
//     offset: offset
//   }
// }

// function find_line_intersection(line_1, line_2) {
//   const x = ((line_1.offset - line_2.offset) / (line_1.multiplier - line_2.multiplier));
//   const y = (line_1.multiplier * x) + line_1.offset;

//   return {
//     x: x,
//     y: y
//   };
// }

function projected_relative_to_canvas(relative_point, canvas) {
  const point_with_aspect_ratio = {
    x: relative_point.x / width_of_view,
    y: relative_point.y / height_of_view
  };

  return {
    x: Math.floor((point_with_aspect_ratio.x * canvas.width) + (canvas.width / 2)),
    y: Math.floor((point_with_aspect_ratio.y * canvas.height) + (canvas.height / 2))
  };
}

function pretty_much_zero(value) {
  // JS sucks with floats, so check the number is _basically_ zero
  return Math.round(value * 100000000000) == 0;
}

function update_fps() {
  fps_display.innerText = `${frame_counter} FPS`;
  frame_counter = 0;
  setTimeout(update_fps, 1000);
}

function frame_logger(data) {
  if (log_frame) {
    console.log(data);
  }
}

document.addEventListener('keydown', function (e) {
  pressed_keys[e.key] = true;
});


document.addEventListener('keyup', function (e) {
  pressed_keys[e.key] = false;
});

function physics() {
  for(var key in pressed_keys) {
    if (pressed_keys[key]) {
      switch (key) {
        case "ArrowRight":
          camera.yaw += 1 * (Math.PI / 180);
          break;

        case "ArrowLeft":
          camera.yaw -= 1 * (Math.PI / 180);
          break;

        case "ArrowUp":
          camera.x += Math.sin(camera.yaw) * 0.05;
          camera.z += Math.cos(camera.yaw) * 0.05;
          break;

        case "ArrowDown":
          camera.x -= Math.sin(camera.yaw) * 0.05;
          camera.z -= Math.cos(camera.yaw) * 0.05;
          break;

        case ".":
          camera.z -= Math.sin(camera.yaw) * 0.05;
          camera.x += Math.cos(camera.yaw) * 0.05;
          break;

        case ",":
          camera.z += Math.sin(camera.yaw) * 0.05;
          camera.x -= Math.cos(camera.yaw) * 0.05;
          break;

        case "d":
          log_frame = true;
          break;

        case " ":
          camera.y += 0.05;
          break;

      }
    }
  }

  setTimeout(physics, 10);
}

render_scene();
update_fps();
physics();
