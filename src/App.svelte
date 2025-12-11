<script lang="ts">
// Map playbar percent (including waits) to robotPercent and wait state
import { getRobotPercentAndWait } from './utils';

const trailSteps = 20;
const MAX_HISTORY = 100;
let lastSavedState = '';
let currentHash = '';
let isUndoRedo = false;
let canUndo = false;
let canRedo = false;
let comparisonMode = false;
function loadActivePathToLegacy() {}
function saveToHistory() {}
function syncPathFromLegacy() {}
function getStateHash() { return ''; }
function deepClone(obj: any) { return JSON.parse(JSON.stringify(obj)); }
function addNewPath() {}
let paths: RobotPath[] = [];
let activePathIndex: number = 0;
  import * as d3 from "d3";
  import { onMount } from "svelte";
  import Two from "two.js";
  import type { Path } from "two.js/src/path";
  import type { Line as PathLine } from "two.js/src/shapes/line";
  import ControlTab from "./lib/ControlTab.svelte";
  import Navbar from "./lib/Navbar.svelte";
  import MathTools from "./lib/MathTools.svelte";
  import _ from "lodash";
  import {
    easeInOutQuad,
    getCurvePoint,
    getMousePos,
    getRandomColor,
    quadraticToCubic,
    radiansToDegrees,
    shortestRotation,
  } from "./utils";
  import hotkeys from 'hotkeys-js';
  import { clickToPlaceMode, centerLineWarningEnabled, collisionNextSegmentOnly, showCornerDots, colliderTrailColorMode } from "./stores";
    import { showAllCollisions } from "./stores";
  import { get } from 'svelte/store';
  import html2canvas from "html2canvas";
  import GIF from "gif.js";

  let two: Two;
  let twoElement: HTMLDivElement;
  let fieldContainer: HTMLDivElement;

  let pointRadius = 1.15;
  let lineWidth = 0.57;
  let robotWidth = 16;
  let robotHeight = 16;
  let settings: FPASettings = {
    xVelocity: 60,
    yVelocity: 60,
    aVelocity: Math.PI,
    kFriction: 0.05,
    rWidth: robotWidth,
    rHeight: robotHeight
  };

  let percent: number = 0;
  let playbackSpeed: number = 1; // Animation speed multiplier (0.25x to 3x)

  /**
   * Converter for X axis from inches to pixels.
   */
  $: x = d3
    .scaleLinear()
    .domain([0, 144])
    .range([0, twoElement?.clientWidth ?? 144]);

  /**
   * Converter for Y axis from inches to pixels.
   */
  $: y = d3
    .scaleLinear()
    .domain([0, 144])
    .range([twoElement?.clientHeight ?? 144, 0]);

  let lineGroup = new Two.Group();
  lineGroup.id = "line-group";
  let pointGroup = new Two.Group();
  pointGroup.id = "point-group";
  let shapeGroup = new Two.Group();
  shapeGroup.id = "shape-group";

  let startPoint: Point = {
    x: 56,
    y: 8,
    heading: "linear",
    startDeg: 90,
    endDeg: 180
  };
  let lines: Line[] = [
    {
      name: "Path 1",
      endPoint: { x: 56, y: 36, heading: "linear", startDeg: 90, endDeg: 180 },
      controlPoints: [],
      color: getRandomColor(),
    },
  ];

  
  function deletePath(index: number) {
    if (paths.length <= 1) return; // Keep at least one path
    paths = paths.filter((_, i) => i !== index);
    if (activePathIndex >= paths.length) {
      activePathIndex = paths.length - 1;
    }
    loadActivePathToLegacy();
    saveToHistory();
  }
  
  function duplicatePath(index: number) {
    const original = paths[index];
    const newColor = getRandomColor();
    const newPath: RobotPath = {
      id: `path-${Date.now()}`,
      name: `${original.name} (copy)`,
      color: newColor,
      startPoint: JSON.parse(JSON.stringify(original.startPoint)),
      lines: JSON.parse(JSON.stringify(original.lines)).map((l: Line) => ({ ...l, color: newColor })),
      visible: true,
    };
    paths = [...paths, newPath];
    activePathIndex = paths.length - 1;
    loadActivePathToLegacy();
    saveToHistory();
  }
  
  function setActivePath(index: number) {
    syncPathFromLegacy(); // Save current path first
    activePathIndex = index;
    loadActivePathToLegacy(); // Load the new path's data
  }
  
  function togglePathVisibility(index: number) {
    paths[index].visible = !paths[index].visible;
    paths = paths; // trigger reactivity
  }
  
  function renamePathPrompt(index: number) {
    const newName = prompt('Enter new path name:', paths[index].name);
    if (newName && newName.trim()) {
      paths[index].name = newName.trim();
      paths = paths;
    }
  }
  
  function changePathColor(index: number, newColor: string) {
    paths[index].color = newColor;
    // Also update all line colors in that path
    paths[index].lines = paths[index].lines.map(line => ({ ...line, color: newColor }));
    paths = paths; // trigger reactivity
    // If this is the active path, sync to lines
    if (index === activePathIndex) {
      lines = lines.map(line => ({ ...line, color: newColor }));
    }
  }

  // Convex hull algorithm (Graham scan) for collision boundary
  function computeConvexHull(points: BasePoint[]): BasePoint[] {
    if (points.length < 3) return points;
    
    // Find the point with lowest y (and leftmost if tie)
    let start = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].y < points[start].y || 
          (points[i].y === points[start].y && points[i].x < points[start].x)) {
        start = i;
      }
    }
    
    const pivot = points[start];
    
    // Sort points by polar angle with respect to pivot
    const sorted = points
      .filter((_, i) => i !== start)
      .map(p => ({
        point: p,
        angle: Math.atan2(p.y - pivot.y, p.x - pivot.x),
        dist: Math.hypot(p.x - pivot.x, p.y - pivot.y)
      }))
      .sort((a, b) => a.angle - b.angle || a.dist - b.dist)
      .map(p => p.point);
    
    // Cross product to determine turn direction
    const cross = (o: BasePoint, a: BasePoint, b: BasePoint) =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    
    const hull: BasePoint[] = [pivot];
    
    for (const p of sorted) {
      while (hull.length > 1 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) {
        hull.pop();
      }
      hull.push(p);
    }
    
    return hull;
  }

  // Undo/Redo History System
  interface HistoryState {
    startPoint: Point;
    lines: Line[];
  }
  
  let undoStack: HistoryState[] = [];
  let redoStack: HistoryState[] = [];
                      // ...existing code...
    if (undoStack.length > MAX_HISTORY) {
      undoStack = undoStack.slice(1);
    }
    
    // Clear redo stack when new action is performed
    redoStack = [];
    lastSavedState = currentHash;

  
  function undo() {
    if (undoStack.length === 0) return;
    
    // Save current state to redo stack
    const currentState = {
      startPoint: deepClone(startPoint),
      lines: deepClone(lines)
    };
    redoStack = [...redoStack, currentState];
    
    // Restore previous state
    const prevState = undoStack[undoStack.length - 1];
    undoStack = undoStack.slice(0, -1);
    
    isUndoRedo = true;
    startPoint = deepClone(prevState.startPoint);
    lines = deepClone(prevState.lines);
    lastSavedState = getStateHash();
    isUndoRedo = false;
  }
  
  function redo() {
    if (redoStack.length === 0) return;
    
    // Save current state to undo stack
    const currentState = {
      startPoint: deepClone(startPoint),
      lines: deepClone(lines)
    };
    undoStack = [...undoStack, currentState];
    
    // Restore next state
    const nextState = redoStack[redoStack.length - 1];
    redoStack = redoStack.slice(0, -1);
    
    isUndoRedo = true;
    startPoint = deepClone(nextState.startPoint);
    lines = deepClone(nextState.lines);
    lastSavedState = getStateHash();
    isUndoRedo = false;
  }
  
  // Track pointer/mouse up to save state after drag operations
  function onPointerUp() {
    if (!isUndoRedo) {
      saveToHistory();
    }
  }
  
  // Save initial state
  onMount(() => {
    lastSavedState = getStateHash();
    saveToHistory();
    
    // Listen for pointer up globally to catch end of drag operations
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('mouseup', onPointerUp);
    
    return () => {
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('mouseup', onPointerUp);
    };
  });

  // Helper function to get robot's 4 corners given center position, size, and rotation angle (in degrees)
  // Helper function to get robot's 4 corners given center position, size, and rotation angle (in degrees)
  // Compute robot corners by taking center point, length, width, and rotation.
  // length: robot front-to-back size (inches)
  // width: robot side-to-side size (inches)
  function getRobotCorners(centerX: number, centerY: number, length: number, width: number, angleDeg: number): BasePoint[] {
    const angleRad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const halfL = length / 2;
    const halfW = width / 2;

    // Local coordinates of corners (relative to robot center, before rotation)
    // Order: front-left, front-right, back-right, back-left
    const cornersLocal = [
      { x: halfL, y: -halfW }, // front-left (forward is +x)
      { x: halfL, y: halfW },  // front-right
      { x: -halfL, y: halfW }, // back-right
      { x: -halfL, y: -halfW } // back-left
    ];

    return cornersLocal.map((c) => ({
      x: centerX + c.x * cos - c.y * sin,
      y: centerY + c.x * sin + c.y * cos,
    }));
  }

  // Calculate heading at a given point along the path
  function getHeadingAtPoint(lineIdx: number, t: number): number {
    const line = lines[lineIdx];
    const _startPoint = lineIdx === 0 ? startPoint : lines[lineIdx - 1].endPoint;
    
    switch (line.endPoint.heading) {
      case "linear":
        return -shortestRotation(
          line.endPoint.startDeg ?? 0,
          line.endPoint.endDeg ?? 0,
          t
        );
      case "constant":
        return -(line.endPoint.degrees ?? 0);
      case "tangential":
        const curvePoints = [_startPoint, ...line.controlPoints, line.endPoint];
        const currentPt = getCurvePoint(t, curvePoints);
        const nextT = t + (line.endPoint.reverse ? -0.01 : 0.01);
        const nextPt = getCurvePoint(Math.max(0, Math.min(1, nextT)), curvePoints);
        const dx = nextPt.x - currentPt.x;
        const dy = nextPt.y - currentPt.y;
        if (dx !== 0 || dy !== 0) {
          return -radiansToDegrees(Math.atan2(dy, dx));
        }
        return 0;
      default:
        return 0;
    }
  }

  // Calculate heading at a given point for any path (used in comparison mode)
  function getHeadingAtPointForPath(pathLines: Line[], pathStart: Point, lineIdx: number, t: number): number {
    const line = pathLines[lineIdx];
    const _startPoint = lineIdx === 0 ? pathStart : pathLines[lineIdx - 1].endPoint;
    
    switch (line.endPoint.heading) {
      case "linear":
        return -shortestRotation(
          line.endPoint.startDeg ?? 0,
          line.endPoint.endDeg ?? 0,
          t
        );
      case "constant":
        return -(line.endPoint.degrees ?? 0);
      case "tangential":
        const curvePoints = [_startPoint, ...line.controlPoints, line.endPoint];
        const currentPt = getCurvePoint(t, curvePoints);
        const nextT = t + (line.endPoint.reverse ? -0.01 : 0.01);
        const nextPt = getCurvePoint(Math.max(0, Math.min(1, nextT)), curvePoints);
        const dx = nextPt.x - currentPt.x;
        const dy = nextPt.y - currentPt.y;
        if (dx !== 0 || dy !== 0) {
          return -radiansToDegrees(Math.atan2(dy, dx));
        }
        return 0;
      default:
        return 0;
    }
  }

  // Reactive center line crossing detection (origin-based)
  // Center line detection removed with collision path logic

  $: points = (() => {
    let _points = [];
    let startPointElem = new Two.Circle(
      x(startPoint.x),
      y(startPoint.y),
      x(pointRadius)
    );
    startPointElem.id = `point-0-0`;
    startPointElem.fill = lines[0].color;
    startPointElem.noStroke();

    _points.push(startPointElem);

    lines.forEach((line, idx) => {
      [line.endPoint, ...line.controlPoints].forEach((point, idx1) => {
        if (idx1 > 0) {
          let pointGroup = new Two.Group();
          pointGroup.id = `point-${idx + 1}-${idx1}`;

          let pointElem = new Two.Circle(
            x(point.x),
            y(point.y),
            x(pointRadius)
          );
          pointElem.id = `point-${idx + 1}-${idx1}-background`;
          pointElem.fill = line.color;
          pointElem.noStroke();

          let pointText = new Two.Text(
            `${idx1}`,
            x(point.x),
            y(point.y - 0.15),
            x(pointRadius)
          );
          pointText.id = `point-${idx + 1}-${idx1}-text`;
          pointText.size = x(1.55);
          pointText.leading = 1;
          pointText.family = "ui-sans-serif, system-ui, sans-serif";
          pointText.alignment = "center";
          pointText.baseline = "middle";
          pointText.fill = "white";
          pointText.noStroke();

          pointGroup.add(pointElem, pointText);
          _points.push(pointGroup);
        } else {
          let pointElem = new Two.Circle(
            x(point.x),
            y(point.y),
            x(pointRadius)
          );
          pointElem.id = `point-${idx + 1}-${idx1}`;
          pointElem.fill = line.color;
          pointElem.noStroke();
          _points.push(pointElem);
        }
      });
    });

    return _points;
  })();

  $: path = (() => {
    let _path: (Path | PathLine)[] = [];

    lines.forEach((line, idx) => {
      let _startPoint = idx === 0 ? startPoint : lines[idx - 1].endPoint;

      let lineElem: Path | PathLine;
      if (line.controlPoints.length > 2) {
        // Approximate an n-degree bezier curve by sampling it at 100 points
        const samples = 100;
        const cps = [_startPoint, ...line.controlPoints, line.endPoint];
        let points = [new Two.Anchor(x(_startPoint.x), y(_startPoint.y), 0, 0, 0, 0, Two.Commands.move)];
        for (let i = 1; i <= samples; ++i) {
          const point = getCurvePoint(i / samples, cps);
          points.push(new Two.Anchor(x(point.x), y(point.y), 0, 0, 0, 0, Two.Commands.line));
        }
        points.forEach((point) => (point.relative = false));

        lineElem = new Two.Path(points);
        lineElem.automatic = false;
      } else if (line.controlPoints.length > 0) {
        let cp1 = line.controlPoints[1]
          ? line.controlPoints[0]
          : quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint)
              .Q1;
        let cp2 =
          line.controlPoints[1] ??
          quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint)
            .Q2;

        let points = [
          new Two.Anchor(
            x(_startPoint.x),
            y(_startPoint.y),
            x(_startPoint.x),
            y(_startPoint.y),
            x(cp1.x),
            y(cp1.y),
            Two.Commands.move
          ),
          new Two.Anchor(
            x(line.endPoint.x),
            y(line.endPoint.y),
            x(cp2.x),
            y(cp2.y),
            x(line.endPoint.x),
            y(line.endPoint.y),
            Two.Commands.curve
          ),
        ];
        points.forEach((point) => (point.relative = false));

        lineElem = new Two.Path(points);
        lineElem.automatic = false;
      } else {
        lineElem = new Two.Line(
          x(_startPoint.x),
          y(_startPoint.y),
          x(line.endPoint.x),
          y(line.endPoint.y)
        );
      }

      lineElem.id = `line-${idx + 1}`;
      lineElem.stroke = line.color;
      lineElem.linewidth = x(lineWidth);
      lineElem.noFill();

      _path.push(lineElem);
    });

    return _path;
  })();

  interface CollisionBox {
    x: number;
    y: number;
    heading: number;
    length: number; // front-back
    width: number;  // side-side
    color: string;
  }

  let robotXY: BasePoint = { x: 0, y: 0 };
  let robotHeading: number = 0;
  let robotPercent: number = 0; // Separate percent for robot position (pauses during waits)

  $: {
    // Use robotPercent for robot position (pauses during waits)
    // Use percent for progress bar/stopwatch (always advancing)
    const effectivePercent = typeof robotPercent !== 'undefined' ? robotPercent : percent;
    let totalLineProgress = (lines.length * Math.min(effectivePercent, 99.999999999)) / 100;
    let currentLineIdx = Math.min(Math.trunc(totalLineProgress), lines.length - 1);
    let currentLine = lines[currentLineIdx];

    let linePercent = easeInOutQuad(totalLineProgress - Math.floor(totalLineProgress));
    let _startPoint = currentLineIdx === 0 ? startPoint : lines[currentLineIdx - 1].endPoint;
    let robotInchesXY = getCurvePoint(linePercent, [_startPoint, ...currentLine.controlPoints, currentLine.endPoint]);
    robotXY = { x: x(robotInchesXY.x), y: y(robotInchesXY.y) };

    switch (currentLine.endPoint.heading) {
      case "linear":
        robotHeading = -shortestRotation(
          currentLine.endPoint.startDeg,
          currentLine.endPoint.endDeg,
          linePercent
        );
        break;
      case "constant":
        robotHeading = -currentLine.endPoint.degrees;
        break;
      case "tangential":
        const nextPointInches = getCurvePoint(
          linePercent + (currentLine.endPoint.reverse ? -0.01 : 0.01),
          [_startPoint, ...currentLine.controlPoints, currentLine.endPoint]
        );
        const nextPoint = { x: x(nextPointInches.x), y: y(nextPointInches.y) };

        const dx = nextPoint.x - robotXY.x;
        const dy = nextPoint.y - robotXY.y;

        if (dx !== 0 || dy !== 0) {
          const angle = Math.atan2(dy, dx);

          robotHeading = -radiansToDegrees(angle);
        }

        break;
    }
  }

  // Helper function to calculate robot position for any path (used in comparison mode)
  function getPathRobotPosition(pathData: RobotPath, currentPercent: number): { x: number; y: number; heading: number } {
    const pathLines = pathData.lines;
    const pathStart = pathData.startPoint;
    
    if (pathLines.length === 0) {
      return { x: x(pathStart.x), y: y(pathStart.y), heading: 0 };
    }
    
    const effectivePercent = Math.min(currentPercent, 99.999999999);
    let totalLineProgress = (pathLines.length * effectivePercent) / 100;
    let currentLineIdx = Math.min(Math.trunc(totalLineProgress), pathLines.length - 1);
    let currentLine = pathLines[currentLineIdx];

    let linePercent = easeInOutQuad(totalLineProgress - Math.floor(totalLineProgress));
    let _startPoint = currentLineIdx === 0 ? pathStart : pathLines[currentLineIdx - 1].endPoint;
    let robotInchesXY = getCurvePoint(linePercent, [_startPoint, ...currentLine.controlPoints, currentLine.endPoint]);
    let posX = x(robotInchesXY.x);
    let posY = y(robotInchesXY.y);
    let heading = 0;

    switch (currentLine.endPoint.heading) {
      case "linear":
        heading = -shortestRotation(
          currentLine.endPoint.startDeg ?? 0,
          currentLine.endPoint.endDeg ?? 0,
          linePercent
        );
        break;
      case "constant":
        heading = -(currentLine.endPoint.degrees ?? 0);
        break;
      case "tangential":
        const nextPointInches = getCurvePoint(
          linePercent + (currentLine.endPoint.reverse ? -0.01 : 0.01),
          [_startPoint, ...currentLine.controlPoints, currentLine.endPoint]
        );
        const nextPoint = { x: x(nextPointInches.x), y: y(nextPointInches.y) };
        const dx = nextPoint.x - posX;
        const dy = nextPoint.y - posY;
        if (dx !== 0 || dy !== 0) {
          heading = -radiansToDegrees(Math.atan2(dy, dx));
        }
        break;
    }

    return { x: posX, y: posY, heading };
  }

  $: (() => {
    if (!two) {
      return;
    }

    two.renderer.domElement.style["z-index"] = "30";
    two.renderer.domElement.style["position"] = "absolute";
    two.renderer.domElement.style["top"] = "0px";
    two.renderer.domElement.style["left"] = "0px";
    two.renderer.domElement.style["width"] = "100%";
    two.renderer.domElement.style["height"] = "100%";

    two.clear();
    // Draw robot origin marker (center) during animation
    if (robotXY) {
      // ...existing code...
      // Show coordinates and rotation, offset further right
      // ...existing code...
      // By default, only show the robot collider at the next point
      // If showAllCollisions is enabled, show all static collision points
      if ($showAllCollisions) {
        const staticSteps = 60;
        const staticColor = 'rgba(0,200,255,0.3)';
        for (let i = 0; i <= staticSteps; i++) {
          const staticPercent = (i / staticSteps) * 100;
          let staticLineProgress = (lines.length * Math.min(staticPercent, 99.999)) / 100;
          let staticLineIdx = Math.min(Math.trunc(staticLineProgress), lines.length - 1);
          let staticLine = lines[staticLineIdx];
          let staticLinePercent = easeInOutQuad(staticLineProgress - Math.floor(staticLineProgress));
          let staticStartPoint = staticLineIdx === 0 ? startPoint : lines[staticLineIdx - 1].endPoint;
          let staticRobotInchesXY = getCurvePoint(staticLinePercent, [staticStartPoint, ...staticLine.controlPoints, staticLine.endPoint]);
          let staticHeading = (() => {
            switch (staticLine.endPoint.heading) {
              case "linear":
                return -shortestRotation(staticLine.endPoint.startDeg, staticLine.endPoint.endDeg, staticLinePercent);
              case "constant":
                return -staticLine.endPoint.degrees;
              case "tangential":
                const staticNextPointInches = getCurvePoint(staticLinePercent + (staticLine.endPoint.reverse ? -0.01 : 0.01), [staticStartPoint, ...staticLine.controlPoints, staticLine.endPoint]);
                const staticDx = staticNextPointInches.x - staticRobotInchesXY.x;
                const staticDy = staticNextPointInches.y - staticRobotInchesXY.y;
                if (staticDx !== 0 || staticDy !== 0) {
                  return -radiansToDegrees(Math.atan2(staticDy, staticDx));
                }
                return 0;
              default:
                return 0;
            }
          })();
          // Compute corners
          const staticAngleRad = (-staticHeading * Math.PI) / 180;
          const staticCos = Math.cos(staticAngleRad);
          const staticSin = Math.sin(staticAngleRad);
          const staticHalfL = robotWidth / 2;
          const staticHalfW = robotHeight / 2;
          const staticCornersInches = [
            { x: staticRobotInchesXY.x + staticHalfL * staticCos - (-staticHalfW) * staticSin, y: staticRobotInchesXY.y + staticHalfL * staticSin + (-staticHalfW) * staticCos },
            { x: staticRobotInchesXY.x + staticHalfL * staticCos - staticHalfW * staticSin, y: staticRobotInchesXY.y + staticHalfL * staticSin + staticHalfW * staticCos },
            { x: staticRobotInchesXY.x + (-staticHalfL) * staticCos - staticHalfW * staticSin, y: staticRobotInchesXY.y + (-staticHalfL) * staticSin + staticHalfW * staticCos },
            { x: staticRobotInchesXY.x + (-staticHalfL) * staticCos - (-staticHalfW) * staticSin, y: staticRobotInchesXY.y + (-staticHalfL) * staticSin + (-staticHalfW) * staticCos }
          ];
          for (let j = 0; j < staticCornersInches.length; j++) {
            const staticA = staticCornersInches[j];
            const staticB = staticCornersInches[(j + 1) % staticCornersInches.length];
            const staticEdge = new Two.Line(x(staticA.x), y(staticA.y), x(staticB.x), y(staticB.y));
            staticEdge.stroke = staticColor;
            staticEdge.linewidth = x(0.12);
            staticEdge.id = `collider-static-${i}-${j}`;
            two.add(staticEdge);
          }
        }
      }
      if ($collisionNextSegmentOnly) {
        // Show all collision points between the robot's current position and the next path point
        const staticLineIdx = Math.min(Math.trunc(percent / 100 * lines.length), lines.length - 1);
        const staticLine = lines[staticLineIdx];
        const staticStartPoint = staticLineIdx === 0 ? startPoint : lines[staticLineIdx - 1].endPoint;
        const steps = 30;
        for (let i = 0; i <= steps; i++) {
          // Uniformly sample between the start and end of the current segment
          const t = i / steps;
          const staticRobotInchesXY = getCurvePoint(t, [staticStartPoint, ...staticLine.controlPoints, staticLine.endPoint]);
          let staticHeading = (() => {
            switch (staticLine.endPoint.heading) {
              case "linear":
                return -shortestRotation(staticLine.endPoint.startDeg, staticLine.endPoint.endDeg, t);
              case "constant":
                return -staticLine.endPoint.degrees;
              case "tangential":
                const staticNextPointInches = getCurvePoint(t + (staticLine.endPoint.reverse ? -0.01 : 0.01), [staticStartPoint, ...staticLine.controlPoints, staticLine.endPoint]);
                const staticDx = staticNextPointInches.x - staticRobotInchesXY.x;
                const staticDy = staticNextPointInches.y - staticRobotInchesXY.y;
                if (staticDx !== 0 || staticDy !== 0) {
                  return -radiansToDegrees(Math.atan2(staticDy, staticDx));
                }
                return 0;
              default:
                return 0;
            }
          })();
          // Compute corners
          const staticAngleRad = (-staticHeading * Math.PI) / 180;
          const staticCos = Math.cos(staticAngleRad);
          const staticSin = Math.sin(staticAngleRad);
          const staticHalfL = robotWidth / 2;
          const staticHalfW = robotHeight / 2;
          const staticCornersInches = [
            { x: staticRobotInchesXY.x + staticHalfL * staticCos - (-staticHalfW) * staticSin, y: staticRobotInchesXY.y + staticHalfL * staticSin + (-staticHalfW) * staticCos },
            { x: staticRobotInchesXY.x + staticHalfL * staticCos - staticHalfW * staticSin, y: staticRobotInchesXY.y + staticHalfL * staticSin + staticHalfW * staticCos },
            { x: staticRobotInchesXY.x + (-staticHalfL) * staticCos - staticHalfW * staticSin, y: staticRobotInchesXY.y + (-staticHalfL) * staticSin + staticHalfW * staticCos },
            { x: staticRobotInchesXY.x + (-staticHalfL) * staticCos - (-staticHalfW) * staticSin, y: staticRobotInchesXY.y + (-staticHalfL) * staticSin + (-staticHalfW) * staticCos }
          ];
          for (let j = 0; j < staticCornersInches.length; j++) {
            const staticA = staticCornersInches[j];
            const staticB = staticCornersInches[(j + 1) % staticCornersInches.length];
            const staticEdge = new Two.Line(x(staticA.x), y(staticA.y), x(staticB.x), y(staticB.y));
            staticEdge.stroke = 'rgba(0,200,255,0.7)';
            staticEdge.linewidth = x(0.18);
            staticEdge.id = `collider-next-${i}-${j}`;
            two.add(staticEdge);
          }
        }
      }
      // If both toggles are off, do not render any collision points
      // ...existing code...
            // Compute corners in inches, then convert to pixels
            const angleRad = (-robotHeading * Math.PI) / 180;
            const cos = Math.cos(angleRad);
            const sin = Math.sin(angleRad);
            const halfL = robotWidth / 2;
            const halfW = robotHeight / 2;
            // Robot center in inches
            const robotInchesXY = { x: x.invert(robotXY.x), y: y.invert(robotXY.y) };
            // Rectangle corners (front-left, front-right, back-right, back-left) in inches
            const cornersInches = [
              { x: robotInchesXY.x + halfL * cos - (-halfW) * sin, y: robotInchesXY.y + halfL * sin + (-halfW) * cos }, // front-left
              { x: robotInchesXY.x + halfL * cos - halfW * sin, y: robotInchesXY.y + halfL * sin + halfW * cos },       // front-right
              { x: robotInchesXY.x + (-halfL) * cos - halfW * sin, y: robotInchesXY.y + (-halfL) * sin + halfW * cos }, // back-right
              { x: robotInchesXY.x + (-halfL) * cos - (-halfW) * sin, y: robotInchesXY.y + (-halfL) * sin + (-halfW) * cos } // back-left
            ];
            // Draw lines from origin to each corner (convert both to pixels)
            cornersInches.forEach((corner, idx) => {
              const line = new Two.Line(robotXY.x, robotXY.y, x(corner.x), y(corner.y));
              line.stroke = '#ff00ff';
              line.linewidth = x(0.15);
              line.id = `origin-to-corner-${idx}`;
              two.add(line);
            });

            // Draw facing direction arrow (0° is right, 180° is left)
            const arrowLength = x(robotWidth * 0.9);
            const arrowAngleRad = (robotHeading * Math.PI) / 180;
            const arrowEndX = robotXY.x + Math.cos(arrowAngleRad) * arrowLength;
            const arrowEndY = robotXY.y + Math.sin(arrowAngleRad) * arrowLength;
            const arrow = new Two.Line(robotXY.x, robotXY.y, arrowEndX, arrowEndY);
            arrow.stroke = '#ff6600';
            arrow.linewidth = x(0.22);
            arrow.id = 'robot-facing-arrow';
            two.add(arrow);
            // Arrowhead
            const headLength = x(1.2);
            const headAngle = Math.PI / 7;
            const leftHeadX = arrowEndX - headLength * Math.cos(arrowAngleRad - headAngle);
            const leftHeadY = arrowEndY - headLength * Math.sin(arrowAngleRad - headAngle);
            const rightHeadX = arrowEndX - headLength * Math.cos(arrowAngleRad + headAngle);
            const rightHeadY = arrowEndY - headLength * Math.sin(arrowAngleRad + headAngle);
            const arrowHeadLeft = new Two.Line(arrowEndX, arrowEndY, leftHeadX, leftHeadY);
            arrowHeadLeft.stroke = '#ff6600';
            arrowHeadLeft.linewidth = x(0.18);
            arrowHeadLeft.id = 'robot-facing-arrowhead-left';
            two.add(arrowHeadLeft);
            const arrowHeadRight = new Two.Line(arrowEndX, arrowEndY, rightHeadX, rightHeadY);
            arrowHeadRight.stroke = '#ff6600';
            arrowHeadRight.linewidth = x(0.18);
            arrowHeadRight.id = 'robot-facing-arrowhead-right';
            two.add(arrowHeadRight);
            // Draw lines between corners to form the collider
            for (let i = 0; i < cornersInches.length; i++) {
              const a = cornersInches[i];
              const b = cornersInches[(i + 1) % cornersInches.length];
              const edge = new Two.Line(x(a.x), y(a.y), x(b.x), y(b.y));
              edge.stroke = '#00ffff';
              edge.linewidth = x(0.18);
              edge.id = `collider-edge-${i}`;
              two.add(edge);
            }
      const originDot = new Two.Circle(robotXY.x, robotXY.y, x(0.7));
      originDot.fill = '#00ff00';
      originDot.noStroke();
      originDot.id = 'robot-origin-dot';
      two.add(originDot);
      // Show coordinates and rotation, offset further right
      const degrees = robotHeading ? robotHeading.toFixed(1) : '0';
      const originLabel = new Two.Text(
        `(${(x.invert(robotXY.x)).toFixed(1)}, ${(y.invert(robotXY.y)).toFixed(1)})\n${degrees}°`,
        robotXY.x + x(5),
        robotXY.y - x(1.5),
        x(2.5)
      );
      originLabel.fill = '#00ff00';
      originLabel.size = x(1.2);
      originLabel.noStroke();
      originLabel.id = 'robot-origin-label';
      two.add(originLabel);
    }

    // In comparison mode, draw all visible paths
    if (comparisonMode) {
      paths.forEach((pathData, pathIdx) => {
        if (!pathData.visible) return;
        const isActive = pathIdx === activePathIndex;
        
        // Draw lines for this path
        pathData.lines.forEach((line, idx) => {
          let _startPoint = idx === 0 ? pathData.startPoint : pathData.lines[idx - 1].endPoint;
          let lineElem: Path | PathLine;
          
          if (line.controlPoints.length > 2) {
            const samples = 100;
            const cps = [_startPoint, ...line.controlPoints, line.endPoint];
            let linePoints = [new Two.Anchor(x(_startPoint.x), y(_startPoint.y), 0, 0, 0, 0, Two.Commands.move)];
            for (let i = 1; i <= samples; ++i) {
              const point = getCurvePoint(i / samples, cps);
              linePoints.push(new Two.Anchor(x(point.x), y(point.y), 0, 0, 0, 0, Two.Commands.line));
            }
            linePoints.forEach((point) => (point.relative = false));
            lineElem = new Two.Path(linePoints);
            lineElem.automatic = false;
          } else if (line.controlPoints.length > 0) {
            let cp1 = line.controlPoints[1]
              ? line.controlPoints[0]
              : quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint).Q1;
            let cp2 = line.controlPoints[1] ?? quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint).Q2;
            let linePoints = [
              new Two.Anchor(x(_startPoint.x), y(_startPoint.y), x(_startPoint.x), y(_startPoint.y), x(cp1.x), y(cp1.y), Two.Commands.move),
              new Two.Anchor(x(line.endPoint.x), y(line.endPoint.y), x(cp2.x), y(cp2.y), x(line.endPoint.x), y(line.endPoint.y), Two.Commands.curve),
            ];
            linePoints.forEach((point) => (point.relative = false));
            lineElem = new Two.Path(linePoints);
            lineElem.automatic = false;
          } else {
            lineElem = new Two.Line(x(_startPoint.x), y(_startPoint.y), x(line.endPoint.x), y(line.endPoint.y));
          }

          lineElem.id = `path-${pathIdx}-line-${idx + 1}`;
          lineElem.stroke = pathData.color;
          lineElem.linewidth = x(lineWidth);
          lineElem.opacity = isActive ? 1 : 0.5;
          lineElem.noFill();
          two.add(lineElem);
        });
        
        // Draw start point for this path
        if (isActive) {
          let startPointElem = new Two.Circle(x(pathData.startPoint.x), y(pathData.startPoint.y), x(pointRadius));
          startPointElem.id = `path-${pathIdx}-point-0`;
          startPointElem.fill = pathData.color;
          startPointElem.noStroke();
          two.add(startPointElem);
        }
      });
      
      // Draw points only for active path
      two.add(...points);
    } else {
      // Single path mode - original behavior
      two.add(...path);
      two.add(...points);
    }

    two.update();
  })();

  let playing = false;

  let animationFrame: number;
  let startTime: number | null = null;
  let previousTime: number | null = null;
  let waitingUntil: number | null = null; // Timestamp when waiting ends
  let lastLineIdx: number = -1; // Track which line we were on
  let accumulatedWaitTime: number = 0; // Track how much wait time has been "used" for percent calculation

  // Calculate total wait time in seconds
  $: totalWaitSeconds = lines.reduce((sum, line) => sum + (line.waitTime || 0), 0);
  // Base movement time in ms (time for robotPercent to go 0-100)
  // robotPercent advances at (0.65 / lines.length) * (deltaTime * 0.1) per ms
  // So to go 100: 100 / ((0.65 / lines.length) * 0.1) = 100 * lines.length / 0.065 ms
  $: baseMovementMs = (100 * lines.length) / 0.065;
  // Total time including waits
  $: totalTimeMs = baseMovementMs + (totalWaitSeconds * 1000);
  // Ratio of movement time to total time
  $: movementRatio = baseMovementMs / totalTimeMs;

  // Sync robotPercent to percent when not playing (allows scrubbing the playbar)
  $: if (!playing) {
    // When scrubbing, map playbar percent to robot percent and wait state
    const { robotPercent: mappedRobotPercent } = getRobotPercentAndWait(percent, lines);
    robotPercent = Math.min(mappedRobotPercent, 99.999);
  }

  function animate(timestamp: number) {
    if (!startTime) {
      startTime = timestamp;
    }

    if (previousTime !== null) {
      const deltaTime = timestamp - previousTime;
      const robotPercentIncrement = (0.65 / lines.length) * (deltaTime * 0.1) * playbackSpeed;
      // Scale percent increment based on whether we're moving or waiting
      const percentIncrementForMovement = robotPercentIncrement * movementRatio;
      const percentIncrementForWait = (deltaTime / totalTimeMs) * 100 * playbackSpeed;

      // Only reset when robot has actually finished the entire path (including final wait)
      const robotFinished = robotPercent >= 99.999 && waitingUntil === null;
      
      if (robotFinished && percent >= 99.9) {
        percent = 0;
        robotPercent = 0;
        lastLineIdx = -1;
        waitingUntil = null;
        accumulatedWaitTime = 0;
      } else {
        // Check if we're currently waiting (robot doesn't move, but progress bar does)
        if (waitingUntil !== null) {
          if (timestamp >= waitingUntil) {
            // Done waiting - continue moving
            waitingUntil = null;
          }
          // During wait: only percent advances, robotPercent stays put
          percent = Math.min(percent + percentIncrementForWait, 100);
        } else {
          // Not waiting - both advance together
          percent = Math.min(percent + percentIncrementForMovement, 100);
          
          if (robotPercent < 99.999) {
            robotPercent = Math.min(robotPercent + robotPercentIncrement, 99.999999);
            
            let totalLineProgress = (lines.length * Math.min(robotPercent, 99.999999)) / 100;
            let currentLineIdx = Math.min(Math.trunc(totalLineProgress), lines.length - 1);
            
            // Check if we just finished a line (moved to a new line)
            if (currentLineIdx > lastLineIdx && lastLineIdx >= 0) {
              const finishedLine = lines[lastLineIdx];
              if (finishedLine.waitTime && finishedLine.waitTime > 0) {
                // Start waiting - robot stays at end of finished line (scaled by playback speed)
                waitingUntil = timestamp + (finishedLine.waitTime * 1000 / playbackSpeed);
              }
            }
            lastLineIdx = currentLineIdx;
          } else {
            // Robot finished, check if we need to wait at the final point
            const lastLine = lines[lines.length - 1];
            if (lastLine.waitTime && lastLine.waitTime > 0 && lastLineIdx === lines.length - 1) {
              // Check if we already triggered the final wait
              if (lastLineIdx !== -2) { // Use -2 as marker that final wait was triggered
                waitingUntil = timestamp + (lastLine.waitTime * 1000 / playbackSpeed);
                lastLineIdx = -2; // Mark final wait as triggered
              }
            }
          }
        }
      }
    }

    previousTime = timestamp;

    if (playing) {
      requestAnimationFrame(animate);
    }
  }

  function play() {
    if (!playing) {
      playing = true;
      startTime = null;
      previousTime = null;
      waitingUntil = null;
      accumulatedWaitTime = 0;
      // When starting from slider position, sync robotPercent using mapping
      const { robotPercent: mappedRobotPercent } = getRobotPercentAndWait(percent, lines);
      robotPercent = Math.min(mappedRobotPercent, 99.999);
      // Initialize lastLineIdx based on current robotPercent
      let totalLineProgress = (lines.length * Math.min(robotPercent, 99.999999999)) / 100;
      lastLineIdx = Math.min(Math.trunc(totalLineProgress), lines.length - 1);
      animationFrame = requestAnimationFrame(animate);
    }
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(animationFrame);
  }

  // GIF capture function
  let gifRecordingProgress = 0;
  let gifFps = 30; // Configurable FPS for GIF export
  
  async function captureGif(): Promise<void> {
    if (!fieldContainer) return;
    
    const wasPlaying = playing;
    if (wasPlaying) pause();
    
    const savedPercent = percent;
    const savedRobotPercent = robotPercent;
    
    // Calculate frames based on FPS and duration
    const totalFrames = Math.round(totalPathDuration * gifFps);
    const frameDelay = Math.round(1000 / gifFps); // ms per frame
    
    // Create GIF encoder
    const gif = new GIF({
      workers: 4,
      quality: 5, // Lower = better quality (1-20)
      width: fieldContainer.clientWidth,
      height: fieldContainer.clientHeight,
      workerScript: '/gif.worker.js'
    });
    
    try {
      // Capture frames
      for (let i = 0; i <= totalFrames; i++) {
        // Set percent for this frame
        percent = (i / totalFrames) * 100;
        robotPercent = Math.min(percent / movementRatio, 99.999);
        
        // Wait for render (shorter delay for faster capture)
        await new Promise(resolve => setTimeout(resolve, 16));
        
        // Capture frame
        const canvas = await html2canvas(fieldContainer, {
          backgroundColor: null,
          scale: 1,
          logging: false,
          useCORS: true
        });
        
        gif.addFrame(canvas, { delay: frameDelay, copy: true });
        
        gifRecordingProgress = Math.round((i / totalFrames) * 100);
      }
      
      // Render GIF
      gif.on('finished', (blob: Blob) => {
        // Download the GIF
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `path-animation-${gifFps}fps-${Date.now()}.gif`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
      
      gif.render();
      
    } finally {
      // Restore state
      percent = savedPercent;
      robotPercent = savedRobotPercent;
      if (wasPlaying) play();
    }
  }
  
  // Reactive binding for Navbar
  $: totalPathDuration = basePathDuration + totalWaitTime;
  $: basePathDuration = (100 * lines.length) / (0.65 * 0.1 * 1000);
  $: totalWaitTime = lines.reduce((sum, line) => sum + (line.waitTime || 0), 0);

  async function fpa(l: FPALine, s: FPASettings): Promise<Line> {
    let status = 'Starting optimization...';
    let result = null;
    // Convert to arrays, not JSON strings - this was the main issue!
    // If no obstacle vertices, create a small default obstacle outside the field
    const inputWaypoints = [l.startPoint, ...l.controlPoints, l.endPoint].map(p => [p.x, p.y]);

    // Extract heading degrees based on Point type
    let startHeadingDeg = 0;
    let endHeadingDeg = 0;

    if (l.startPoint.heading === "linear") {
      startHeadingDeg = l.startPoint.startDeg ?? 0;
    } else if (l.startPoint.heading === "constant") {
      startHeadingDeg = (l.startPoint as any).degrees ?? 0;
    }

    if (l.endPoint.heading === "linear") {
      endHeadingDeg = l.endPoint.endDeg ?? 0;
    } else if (l.endPoint.heading === "constant") {
      endHeadingDeg = (l.endPoint as any).degrees ?? 0;
    }

    console.log('FPA Optimization Parameters:');
    console.log('Waypoints:', inputWaypoints);
    console.log('Start heading:', startHeadingDeg);
    console.log('End heading:', endHeadingDeg);
    console.log('Settings:', s);

    const payload = {
                waypoints: inputWaypoints,
                start_heading_degrees: startHeadingDeg,
                end_heading_degrees: endHeadingDeg,
                x_velocity: s.xVelocity,
                y_velocity: s.yVelocity,
                angular_velocity: s.aVelocity,
                friction_coefficient: s.kFriction,
                robot_width: s.rWidth,
                robot_height: s.rHeight,
                min_coord_field: 0,
                max_coord_field: 144,
                interpolation: l.interpolation === "tangential" ? "tangent" : l.interpolation
    };
    try {
      result = await runOptimization(payload);
      status = 'Optimization Complete!';
    } catch (e: any) {
      status = 'Error: ' + e.message;
      throw e;
    }

    // result is already parsed JSON data, no need to call .json()
    const resultData = result;

    // Handle the new API format that returns optimized_waypoints
    let optimizedWaypoints;
    if (resultData.optimized_waypoints) {
      optimizedWaypoints = resultData.optimized_waypoints;
    } else if (Array.isArray(resultData)) {
      // Legacy format support
      optimizedWaypoints = resultData;
    } else {
      throw new Error('Unexpected result format from optimization API');
    }

    // Handle the different Point types based on heading
    let endPoint: Point;

    if (l.interpolation === "tangential") {
      endPoint = {
        x: optimizedWaypoints[optimizedWaypoints.length - 1][0],
        y: optimizedWaypoints[optimizedWaypoints.length - 1][1],
        heading: "tangential",
        reverse: l.endPoint.reverse ?? false
      };
    } else if (l.interpolation === "constant") {
      endPoint = {
        x: optimizedWaypoints[optimizedWaypoints.length - 1][0],
        y: optimizedWaypoints[optimizedWaypoints.length - 1][1],
        heading: "constant",
        degrees: (l.endPoint as any).degrees ?? 0
      };
    } else {
      // linear
      endPoint = {
        x: optimizedWaypoints[optimizedWaypoints.length - 1][0],
        y: optimizedWaypoints[optimizedWaypoints.length - 1][1],
        heading: "linear",
        startDeg: l.endPoint.startDeg ?? 0,
        endDeg: l.endPoint.endDeg ?? 0
      };
    }

    return {
      name: l.name,
      endPoint,
      color: l.color,
      controlPoints: optimizedWaypoints.slice(1, optimizedWaypoints.length - 1).map((p: number[]) => ({ x: p[0], y: p[1] }))
    }

    /*return {
        endPoint: { x: 36, y: 80, heading: "linear", startDeg: 0, endDeg: 0 },
        controlPoints: [],
        color: getRandomColor(),
      }*/
  }
  

    function sleep(ms: number) {
        return new Promise(res => setTimeout(res, ms));
    }

    export async function createTask(payload: any) {
        try {
            console.log('Creating optimization task with payload:', payload);
            const response = await fetch('https://fpa.pedropathing.com/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            console.log('Response status:', response.status);

            // Handle offline response from service worker
            if (response.status === 503) {
                const errorData = await response.json();
                if (errorData.error === 'offline') {
                    throw new Error('OFFLINE: ' + errorData.message);
                }
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Job created with ID:', data.job_id);
            return data.job_id;
        } catch (error) {
            console.error('Failed to create optimization task:', error);
            throw error;
        }
    }

    export async function pollForResult(jobId: string, pollInterval = 1000, maxTries = 60) {
        for (let i = 0; i < maxTries; i++) {
            try {
                const response = await fetch(`https://fpa.pedropathing.com/job/${jobId}`);

                // Handle offline response from service worker
                if (response.status === 503) {
                    const errorData = await response.json();
                    if (errorData.error === 'offline') {
                       console.log('OFFLINE: ' + errorData.message)
                        throw new Error('OFFLINE: ' + errorData.message);
                    }
                }

                if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                const data = await response.json();
                if (data.status === 'completed' && data.result) {
                    return data.result;
                } else if (data.status === 'error') {
                    throw new Error('Optimization failed with error.');
                }
                await sleep(pollInterval);
            } catch (error) {
                console.error(`Polling attempt ${i + 1} failed:`, error);
                if (i === maxTries - 1) throw error; // Re-throw on last attempt
                await sleep(pollInterval);
            }
        }
        console.log('Polling timed out after', maxTries, 'attempts.')
        throw new Error('Timeout waiting for job result.');
    }

    // 3. Run Optimization - creates task, then polls for result and returns it
    export async function runOptimization(payload: any, pollInterval = 1000, maxTries = 60) {
        const jobId = await createTask(payload);
        const result = await pollForResult(jobId, pollInterval, maxTries);
        return result;
    }

  onMount(() => {
    two = new Two({
      fitted: true,
      type: Two.Types.svg,
    }).appendTo(twoElement);

    updateRobotImage();

    let currentElem: string | null = null;
    let isDown = false;

    two.renderer.domElement.addEventListener("mousemove", (evt: MouseEvent) => {
      const elem = document.elementFromPoint(evt.clientX, evt.clientY);
      if (isDown && currentElem) {
        const { x: xPos, y: yPos } = getMousePos(evt, two.renderer.domElement);
          // Handle path point dragging
          const line = Number(currentElem.split("-")[1]) - 1;
          const point = Number(currentElem.split("-")[2]);

          if (line === -1) {
            startPoint.x = x.invert(xPos);
            startPoint.y = y.invert(yPos);
          } else {
            if (point === 0) {
              lines[line].endPoint.x = x.invert(xPos);
              lines[line].endPoint.y = y.invert(yPos);
            } else {
              lines[line].controlPoints[point - 1].x = x.invert(xPos);
              lines[line].controlPoints[point - 1].y = y.invert(yPos);
            }
          }
      } else {
        if (elem?.id.startsWith("point") || elem?.id.startsWith("obstacle")) {
          two.renderer.domElement.style.cursor = "pointer";
          currentElem = elem.id;
        } else {
          two.renderer.domElement.style.cursor = $clickToPlaceMode ? "crosshair" : "auto";
          currentElem = null;
        }
      }
    });
    two.renderer.domElement.addEventListener("mousedown", () => {
      isDown = true;
    });
      two.renderer.domElement.addEventListener("mouseup", () => {
        isDown = false;
        saveToHistory(); // Save state after dragging point
      });
    // Drag point handler (fix teleportation)
    two.renderer.domElement.addEventListener("mousemove", (evt: MouseEvent) => {
      if (isDown && currentElem) {
        const { x: xPos, y: yPos } = getMousePos(evt, two.renderer.domElement);
        const parts = currentElem.split("-");
        const lineIdx = Number(parts[1]) - 1;
        const pointIdx = Number(parts[2]);
        if (lineIdx === -1) {
          startPoint.x = x.invert(xPos);
          startPoint.y = y.invert(yPos);
        } else {
          if (pointIdx === 0) {
            lines[lineIdx].endPoint.x = x.invert(xPos);
            lines[lineIdx].endPoint.y = y.invert(yPos);
          } else {
            lines[lineIdx].controlPoints[pointIdx - 1].x = x.invert(xPos);
            lines[lineIdx].controlPoints[pointIdx - 1].y = y.invert(yPos);
          }
        }
      }
    });
    // Click-to-place handler
    two.renderer.domElement.addEventListener("click", (evt: MouseEvent) => {
      if (!$clickToPlaceMode) return;
      const elem = document.elementFromPoint(evt.clientX, evt.clientY);
      if (elem?.id.startsWith("point")) return;
      const { x: xPos, y: yPos } = getMousePos(evt, two.renderer.domElement);
      const newX = x.invert(xPos);
      const newY = y.invert(yPos);
      lines = [
        ...lines,
        {
          name: `Path ${lines.length + 1}`,
          endPoint: {
            x: newX,
            y: newY,
            heading: "tangential",
            reverse: false,
          },
          controlPoints: [],
          color: getRandomColor(),
        },
      ];
    });
  });

  document.addEventListener("keydown", function (evt) {
    if (evt.code === "Space" && document.activeElement === document.body) {
      if (playing) {
        pause();
      } else {
        play();
      }
    }

    const updateScale = () => {
        x = d3
          .scaleLinear()
          .domain([0, 144])
          .range([0, twoElement?.clientWidth ?? 144]);

        y = d3
          .scaleLinear()
          .domain([0, 144])
          .range([twoElement?.clientHeight ?? 144, 0]);
      };

      const observer = new ResizeObserver(() => {
        updateScale();
      });

      observer.observe(twoElement);
  });

  function saveFile() {
    const jsonString = JSON.stringify({ startPoint, lines});

    const blob = new Blob([jsonString], { type: "application/json" });

    const linkObj = document.createElement("a");

    const url = URL.createObjectURL(blob);

    linkObj.href = url;
    linkObj.download = "trajectory.pp";

    document.body.appendChild(linkObj);

    linkObj.click();

    document.body.removeChild(linkObj);

    URL.revokeObjectURL(url);
  }

  function loadFile(evt: Event) {
    const elem = evt.target as HTMLInputElement;
    const file = elem.files?.[0];

    if (file) {
      const reader = new FileReader();

      reader.onload = function (e: ProgressEvent<FileReader>) {
        try {
          const result = e.target?.result as string;

          const jsonObj: {
            startPoint: Point;
            lines: Line[];
            shapes?: Shape[];
          } = JSON.parse(result);

          startPoint = jsonObj.startPoint;
          lines = jsonObj.lines;
        } catch (err) {
          console.error(err);
        }
      };

      reader.readAsText(file);
    }
  }

  // Reactive robot image source
  let robotImageSrc: string = localStorage.getItem('robot.png') || '/robot.png';

  function loadRobot(evt: Event) {
    const elem = evt.target as HTMLInputElement;
    const file = elem.files?.[0];

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml'];
    
    if (file && validTypes.includes(file.type)) {
      const reader = new FileReader();

      reader.onload = function (e: ProgressEvent<FileReader>) {
        const result = e.target?.result as string;
        localStorage.setItem('robot.png', result);
        robotImageSrc = result;
      };

      reader.readAsDataURL(file);
    } else {
      console.error("Invalid file type. Please upload a PNG, JPG, WEBP, GIF, or SVG file.");
      alert("Invalid file type. Please upload a PNG, JPG, WEBP, GIF, or SVG image.");
    }
  }

  function updateRobotImage() {
    const storedImage = localStorage.getItem('robot.png');
    if (storedImage) {
      robotImageSrc = storedImage;
    }
  }

  function addNewLine() {
    saveToHistory(); // Save state before making change
    lines = [
      ...lines,
      {
        endPoint: {
          x: _.random(36, 108),
          y: _.random(36, 108),
          heading: "tangential",
          reverse: true,
        } as Point,
        controlPoints: [],
        color: getRandomColor(),
      },
    ];
  }

  function addControlPoint() {
    if (lines.length > 0) {
      saveToHistory(); // Save state before making change
      const lastLine = lines[lines.length - 1];
      lastLine.controlPoints.push({
        x: _.random(36, 108),
        y: _.random(36, 108),
      });
      lines = [...lines]; // Trigger reactivity
    }
  }

  function removeControlPoint() {
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      if (lastLine.controlPoints.length > 0) {
        saveToHistory(); // Save state before making change
        lastLine.controlPoints.pop();
        lines = [...lines]; // Trigger reactivity
      }
    }
  }

hotkeys('w', function(event, handler){
  event.preventDefault();
  addNewLine();
});


hotkeys('a', function(event, handler){
  event.preventDefault();
  addControlPoint();
  two.update();
});

hotkeys('s', function(event, handler){
  event.preventDefault();
  removeControlPoint();
  two.update();
});

hotkeys('ctrl+z, command+z', function(event, handler){
  event.preventDefault();
  undo();
});

hotkeys('ctrl+y, command+y, ctrl+shift+z, command+shift+z', function(event, handler){
  event.preventDefault();
  redo();
});

// Reactive bindings for undo/redo button states
$: canUndo = undoStack.length > 0;
$: canRedo = redoStack.length > 0;

</script>

<Navbar bind:lines bind:startPoint bind:settings bind:robotWidth bind:robotHeight bind:percent bind:gifFps {saveFile} {loadFile} {loadRobot} {undo} {redo} {canUndo} {canRedo} {captureGif}/>

<!-- Center Line Crossing Warning -->

<div
  class="w-screen h-screen pt-16 pb-2 px-2 flex flex-row justify-center items-stretch gap-2 overflow-hidden"
>
  <!-- Path Selector Panel -->
  <div class="w-48 flex-shrink-0 flex flex-col gap-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-2 overflow-hidden">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Paths</h3>
      <button
        on:click={addNewPath}
        class="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
        title="Add new path"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    </div>
    
    <!-- Comparison Mode Toggle -->
    <label class="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400 cursor-pointer">
      <input
        type="checkbox"
        bind:checked={comparisonMode}
        class="rounded border-neutral-300 dark:border-neutral-600"
      />
      Compare paths
    </label>
    
    <div class="flex-1 overflow-y-auto space-y-1">
      {#each paths as path, index}
        <div
          class="flex items-center gap-2 p-2 rounded cursor-pointer transition-colors {index === activePathIndex ? 'bg-blue-100 dark:bg-blue-900/50 ring-1 ring-blue-500' : 'hover:bg-neutral-200 dark:hover:bg-neutral-700'}"
          on:click={() => setActivePath(index)}
          on:keydown={(e) => e.key === 'Enter' && setActivePath(index)}
          role="button"
          tabindex="0"
        >
          <!-- Visibility Toggle -->
          <button
            on:click|stopPropagation={() => togglePathVisibility(index)}
            class="p-0.5 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600"
            title={path.visible ? 'Hide path' : 'Show path'}
          >
            {#if path.visible}
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-40">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
              </svg>
            {/if}
          </button>
          
          <!-- Color picker -->
          <label class="relative flex-shrink-0 cursor-pointer" title="Change path color">
            <input
              type="color"
              value={path.color}
              on:input|stopPropagation={(e) => changePathColor(index, e.currentTarget.value)}
              on:click|stopPropagation
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div
              class="w-4 h-4 rounded-full border-2 border-white dark:border-neutral-600 shadow-sm"
              style="background-color: {path.color}"
            ></div>
          </label>
          
          <!-- Path name -->
          <span
            class="flex-1 text-xs truncate text-neutral-700 dark:text-neutral-300"
            on:dblclick|stopPropagation={() => renamePathPrompt(index)}
            title="Double-click to rename"
          >
            {path.name}
          </span>
          
          <!-- Path menu -->
          <div class="flex items-center gap-0.5">
            <button
              on:click|stopPropagation={() => duplicatePath(index)}
              class="p-0.5 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 opacity-60 hover:opacity-100"
              title="Duplicate path"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            {#if paths.length > 1}
              <button
                on:click|stopPropagation={() => deletePath(index)}
                class="p-0.5 rounded hover:bg-red-200 dark:hover:bg-red-900/50 opacity-60 hover:opacity-100 text-red-600 dark:text-red-400"
                title="Delete path"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
    
    <!-- Path info -->
    <div class="border-t border-neutral-300 dark:border-neutral-600 pt-2 text-xs text-neutral-500 dark:text-neutral-400">
      <div>{paths.length} path{paths.length !== 1 ? 's' : ''}</div>
      {#if comparisonMode}
        <div class="text-blue-500">Comparison active</div>
      {/if}
    </div>
  </div>

  <div class="flex h-full justify-center items-center flex-shrink-0">
    <div
      bind:this={fieldContainer}
      class="h-full max-h-[calc(100vh-5rem)] aspect-square relative"
    >
      <div
        bind:this={twoElement}
        class="w-full h-full rounded-lg shadow-md bg-neutral-50 dark:bg-neutral-900 relative overflow-visible"
      >
        <img
          src="/Pedro-Visualzier-18127/fields/decode.webp"
          alt="Field"
          class="absolute top-0 left-0 w-full h-full rounded-lg z-10 pointer-events-none"
        />
        <MathTools {x} {y} {twoElement} {robotXY} />
        
        <!-- Primary Robot (active path) -->
        <img
          src={robotImageSrc}
          alt="Robot"
          style={`position: absolute; top: ${robotXY.y}px; left: ${robotXY.x}px; transform: translate(-50%, -50%) rotate(${robotHeading}deg); z-index: 20; width: ${x(robotWidth)}px; height: ${x(robotHeight)}px; object-fit: fill;`}
        />
        
        <!-- Comparison mode: render ghost robots for other visible paths -->
        {#if comparisonMode}
          {#each paths as otherPath, idx}
            {#if idx !== activePathIndex && otherPath.visible}
              {@const otherRobot = getPathRobotPosition(otherPath, robotPercent)}
              <div
                class="absolute pointer-events-none"
                style={`top: ${otherRobot.y}px; left: ${otherRobot.x}px; transform: translate(-50%, -50%) rotate(${otherRobot.heading}deg); z-index: 19; width: ${x(robotWidth)}px; height: ${x(robotHeight)}px; opacity: 0.5; border: 2px dashed ${otherPath.color}; border-radius: 4px;`}
              >
                <div class="w-full h-full flex items-center justify-center text-xs font-bold" style="color: {otherPath.color}">
                  {idx + 1}
                </div>
              </div>
            {/if}
          {/each}
        {/if}
      </div>
    </div>
  </div>
  <ControlTab
    bind:playing
    {play}
    {pause}
    bind:startPoint
    bind:lines
    bind:robotWidth
    bind:robotHeight
    bind:settings
    bind:percent
    bind:robotXY
    bind:robotHeading
    bind:playbackSpeed
    {x}
    {y}
  />
 </div>
