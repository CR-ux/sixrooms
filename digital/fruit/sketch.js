let maskImage;
let music;
let fft;

let sourceLines;
let words = [];

let visibleWords = [];

let currentWord = 0;
let lastWordTime = 0;

const millisecondsPerWord = 1000;
const FFT_BANDS = 1024;

let started = false;
let startButton;

// Increase this to include lighter areas of the mask.
// Dark pixels below this number receive text.
let maskThreshold = 110;

// Visual sensitivity controls.
let overtoneSensitivity = 1.8;
let peakSensitivity = 1.6;

function preload() {
  maskImage = loadImage("https://www.notborges.org/digital/fruit/tree_ref.png");

  sourceLines = loadStrings("https://www.notborges.org/digital/fruit/fruit.txt.txt");

  music = loadSound(
    "https://media.notborges.org/Media/Audio/Exegesis_6.wav",
    () => console.log("Audio loaded"),
    error => console.error("Audio failed to load:", error)
  );
}

function setup() {
  createCanvas(windowWidth, windowHeight);

  pixelDensity(1);
  frameRate(30);

  background(0);

  textFont("Courier New");
  textSize(12);
  textAlign(CENTER, CENTER);

  sourceText = sourceLines.join(" ");

  // Split on one or more whitespace characters.
  words = sourceText.trim().split(/\s+/);

  prepareMask();

  /*
    First value is FFT smoothing:
    0 = immediate and nervous
    1 = extremely smooth

    Second value is the number of FFT bins.
  */
  fft = new p5.FFT(0.82, FFT_BANDS);

  fft.setInput(music);

  createStartButton();
}

function prepareMask() {
  /*
    Stretch the mask to the canvas.

    For a website, a proportional crop may eventually be
    preferable, but this directly matches your Processing code.
  */
  maskImage.resize(width, height);
  maskImage.filter(GRAY);
  maskImage.loadPixels();
}

function createStartButton() {
  startButton = createButton("EAT.");

  startButton.mousePressed(async () => {
    /*
      Browsers require audio to begin after a visitor
      clicks or taps the page.
    */
    await userStartAudio();

    background(0);

    visibleWords = [];
    currentWord = 0;

    music.stop();
    music.play();

    started = true;

    startButton.remove();
  });
}

function draw() {
  if (!started) {
    return;
  }

  /*
    Draw a faint black layer instead of completely clearing
    the canvas. Lower alpha gives longer persistence.
  */
  rectMode(CORNER);
  noStroke();
  fill(0, 3);
  rect(0, 0, width, height);

  const spectrum = fft.analyze();

  const overtoneEnergy =
    getOvertoneEnergy(spectrum);

  const peakEnergy =
    getStrongestOvertonePeak(spectrum);

  revealNextWord();

  for (const fragment of visibleWords) {
    fragment.update(
      overtoneEnergy,
      peakEnergy
    );

    fragment.display(
      overtoneEnergy,
      peakEnergy
    );
  }

  /*
    Stop drawing new words once the audio has ended.
    Existing words can remain visible.
  */
  if (
    currentWord >= words.length ||
    (!music.isPlaying() && music.currentTime() > 0)
  ) {
    // Leave the final field onscreen.
  }
}

function revealNextWord() {
  if (currentWord >= words.length) {
    return;
  }

  const elapsedAudioMilliseconds =
    music.currentTime() * 1000;

  const targetWordCount = min(
    words.length,
    floor(
      elapsedAudioMilliseconds /
      millisecondsPerWord
    ) + 1
  );

  while (currentWord < targetWordCount) {
    const position = findMaskPosition();

    if (position === null) {
      break;
    }

    visibleWords.push(
      new WordFragment(
        words[currentWord],
        position.x,
        position.y
      )
    );

    currentWord++;
  }
}

function getOvertoneEnergy(spectrum) {
  /*
    These fractions select an upper-middle/high portion
    of the FFT.

    The p5.js FFT produces values between 0 and 255,
    unlike your original Processing FFT values.
  */
  const startBin = floor(
    spectrum.length * 0.12
  );

  const endBin = floor(
    spectrum.length * 0.83
  );

  let total = 0;

  for (let i = startBin; i < endBin; i++) {
    total += spectrum[i];
  }

  const average =
    total / max(1, endBin - startBin);

  /*
    Tune these input values to your recording.

    An average below 2 is treated as calm.
    An average around 30 is treated as highly active.
  */
  let amount = map(
    average,
    2,
    30,
    0,
    1
  );

  amount *= overtoneSensitivity;

  return constrain(amount, 0, 1);
}

function getStrongestOvertonePeak(spectrum) {
  const startBin = floor(
    spectrum.length * 0.12
  );

  const endBin = floor(
    spectrum.length * 0.9
  );

  let strongest = 0;

  for (let i = startBin; i < endBin; i++) {
    strongest = max(
      strongest,
      spectrum[i]
    );
  }

  let amount = map(
    strongest,
    20,
    180,
    0,
    1
  );

  amount *= peakSensitivity;

  return constrain(amount, 0, 1);
}

class WordFragment {
  constructor(word, x, y) {
    this.word = word;

    this.x = x;
    this.y = y;

    this.driftX = random(-0.04, 0.04);
    this.driftY = random(-0.03, 0.03);

    this.age = 0;
  }

  update(overtoneEnergy, peakEnergy) {
    this.age++;

    /*
      Broad overtone activity increases the continuous drift.
    */
    const movement =
      1 + overtoneEnergy * 6;

    const proposedX =
      this.x + this.driftX * movement;

    const proposedY =
      this.y + this.driftY * movement;

    if (maskAllows(proposedX, proposedY)) {
      this.x = proposedX;
      this.y = proposedY;
    } else {
      this.driftX *= -1;
      this.driftY *= -1;
    }

    /*
      Narrow spectral peaks cause sudden displacement.
    */
    const damageChance =
      peakEnergy * 0.08 +
      overtoneEnergy * 0.025;

    if (random(1) < damageChance) {
      const damagedX =
        this.x +
        random(-10, 10) *
        max(0.2, overtoneEnergy);

      const damagedY =
        this.y +
        random(-4, 4) *
        max(0.2, overtoneEnergy);

      if (maskAllows(damagedX, damagedY)) {
        this.x = damagedX;
        this.y = damagedY;
      }
    }
  }

  display(overtoneEnergy, peakEnergy) {
    textFont("Courier New");
    textSize(12);
    textAlign(CENTER, CENTER);

    fill(125, 125, 125, 110);

    text(
      this.word,
      this.x,
      this.y
    );

    this.drawGhostCopies(overtoneEnergy);

    this.drawCharacterGlitches(
      overtoneEnergy,
      peakEnergy
    );

    this.drawRedaction(
      overtoneEnergy,
      peakEnergy
    );
  }

  drawGhostCopies(overtoneEnergy) {
    const copyCount = floor(
      overtoneEnergy * 8
    );

    for (let i = 0; i < copyCount; i++) {
      const offsetX =
        random(-18, 18) *
        overtoneEnergy;

      const offsetY =
        random(-5, 5) *
        overtoneEnergy;

      const ghostX =
        this.x + offsetX;

      const ghostY =
        this.y + offsetY;

      if (!maskAllows(ghostX, ghostY)) {
        continue;
      }

      if (random(1) < 0.3) {
        fill(65, 8, 12, 35);
      } else {
        fill(100, 100, 100, 22);
      }

      text(
        this.word,
        ghostX,
        ghostY
      );
    }
  }

  drawCharacterGlitches(
    overtoneEnergy,
    peakEnergy
  ) {
    if (overtoneEnergy < 0.18) {
      return;
    }

    const totalWidth =
      textWidth(this.word);

    let cursorX =
      this.x - totalWidth * 0.5;

    for (
      let i = 0;
      i < this.word.length;
      i++
    ) {
      const character =
        this.word.charAt(i);

      const characterWidth =
        textWidth(character);

      const glitchChance =
        constrain(
          overtoneEnergy * 0.8 +
          peakEnergy * 0.6,
          0,
          1
        );

      if (random(1) < glitchChance) {
        const characterX =
          cursorX +
          characterWidth * 0.5;

        const offsetX =
          random(-14, 14) *
          overtoneEnergy;

        const offsetY =
          random(-8, 8) *
          overtoneEnergy;

        const glitchX =
          characterX + offsetX;

        const glitchY =
          this.y + offsetY;

        if (maskAllows(glitchX, glitchY)) {
          if (random(1) < 0.25) {
            fill(75, 8, 12, 70);
          } else {
            fill(145, 145, 145, 65);
          }

          text(
            character,
            glitchX,
            glitchY
          );
        }
      }

      cursorX += characterWidth;
    }
  }

  drawRedaction(
    overtoneEnergy,
    peakEnergy
  ) {
    let redactionStrength =
      max(
        0,
        overtoneEnergy - 0.28
      );

    redactionStrength +=
      peakEnergy * 0.25;

    if (
      random(1) >
      redactionStrength * 0.18
    ) {
      return;
    }

    const wordWidth =
      textWidth(this.word);

    const redactWidth =
      random(
        wordWidth * 0.2,
        wordWidth
      );

    const redactHeight =
      random(3, 11);

    const redactX =
      this.x +
      random(
        -wordWidth * 0.35,
        wordWidth * 0.35
      );

    const redactY =
      this.y +
      random(-8, 8);

    push();

    rectMode(CENTER);
    noStroke();

    fill(0, 0, 0, 210);

    rect(
      redactX,
      redactY,
      redactWidth,
      redactHeight
    );

    if (
      peakEnergy > 0.45 &&
      random(1) < 0.35
    ) {
      fill(55, 5, 8, 90);

      rect(
        redactX + random(-4, 4),
        redactY + random(-2, 2),
        redactWidth,
        1
      );
    }

    pop();
  }
}

function findMaskPosition() {
  for (
    let attempt = 0;
    attempt < 5000;
    attempt++
  ) {
    const x = floor(random(width));
    const y = floor(random(height));

    const value =
      maskBrightnessAt(x, y);

    /*
      Text is allowed in dark areas of the mask.
      Change < to > to select light areas instead.
    */
    if (value < maskThreshold) {
      return createVector(x, y);
    }
  }

  return null;
}

function maskAllows(x, y) {
  if (
    x < 0 ||
    x >= width ||
    y < 0 ||
    y >= height
  ) {
    return false;
  }

  return (
    maskBrightnessAt(x, y) <
    maskThreshold
  );
}

function maskBrightnessAt(x, y) {
  const px = constrain(
    floor(x),
    0,
    maskImage.width - 1
  );

  const py = constrain(
    floor(y),
    0,
    maskImage.height - 1
  );

  const index =
    4 * (
      px +
      py * maskImage.width
    );

  /*
    p5 image pixels are stored as:
    red, green, blue, alpha.

    The image has already been converted to grayscale,
    so reading red is sufficient.
  */
  return maskImage.pixels[index];
}

function keyPressed() {
  if (key === " ") {
    if (music.isPlaying()) {
      music.pause();
    } else {
      userStartAudio();
      music.play();
    }
  }

  if (key === "r" || key === "R") {
    restartPiece();
  }

  if (key === "[") {
    maskThreshold = max(
      0,
      maskThreshold - 10
    );

    console.log(
      "Mask threshold:",
      maskThreshold
    );
  }

  if (key === "]") {
    maskThreshold = min(
      255,
      maskThreshold + 10
    );

    console.log(
      "Mask threshold:",
      maskThreshold
    );
  }
}

function restartPiece() {
  visibleWords = [];

  currentWord = 0;

  background(0);

  music.stop();
  music.play();

  started = true;
}
