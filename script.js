"use strict";

// Function to convert a string to binary
function stringToBinary(input) {
    return input.split('').map(char => char.charCodeAt(0).toString(2).padStart(8, '0')).join('');
}

// Function to play audio directly in the browser
function playAudio(buffer, context) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();
    console.log('Playing encoded audio...');
}

function vigenereEnc(msg, key) {
    const alphabetUpper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const alphabetLower = "abcdefghijklmnopqrstuvwxyz";

    var k = [];
    for (const c of key.toUpperCase()) k.push(alphabetUpper.indexOf(c));
    var new_msg = "";

    var k_i = 0;
    for (const c of msg) {
        k_i %= k.length;
        if (alphabetLower.includes(c)) {
            new_msg += alphabetLower[(alphabetLower.indexOf(c) + k[k_i]) % 26];
            k_i++;
        } else if (alphabetUpper.includes(c)) {
            new_msg += alphabetUpper[(alphabetUpper.indexOf(c) + k[k_i]) % 26];
            k_i++;
        } else {
            new_msg += c;
        }
    }

    return new_msg;
}

function vigenereDec(msg, key) {
    console.log(msg);
    const alphabetLower = "abcdefghijklmnopqrstuvwxyz"
    const alphabetUpper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

    var k = [];
    for (const c of key) k.push(alphabetUpper.indexOf(c));
    var new_msg = "";

    var k_i = 0;
    for (const c of msg) {
        k_i %= k.length;
        if (alphabetLower.includes(c)) {
            new_msg += alphabetLower[(alphabetLower.indexOf(c) - k[k_i] + 26) % 26];
            k_i++;
        } else if (alphabetUpper.includes(c)) {
            new_msg += alphabetUpper[(alphabetUpper.indexOf(c) - k[k_i] + 26) % 26];
            k_i++;
        } else {
            new_msg += c;
        }
    }
    return new_msg;
}


// Encode function
async function encode() {
    console.log('Starting encoding process...');

    const startFile = document.querySelector("input[name='startFile']").files[0];
    const secretMessage = document.querySelector("textarea").value;
    const audioInput = document.getElementById('audioInput').files[0];
    const message = document.getElementById('messageInput').value;
    const encrypt = document.getElementById('encrypt').value;
    let encryptKey = document.getElementById('encryptKey').value;

    const audioFileToUse = startFile || audioInput;
    let messageToEncode = secretMessage || message;

    if (!audioFileToUse) {
        alert('Please upload an audio file.');
        return;
    }
    if (!messageToEncode) {
        alert('Please enter a message to encode.');
        return;
    }
    if (encrypt) {
        if (!encryptKey) {
            alert('Please enter a key to encrypt with.');
            return;
        }
        encryptKey = encryptKey.toUpperCase();
        if (encryptKey.match(/[^A-Z]/g)) {
            alert('Please enter a valid key (only alphabetic characters)');
            return;
        }

        messageToEncode = vigenereEnc(messageToEncode, encryptKey)
    }

    console.log('Audio file and message retrieved successfully.');

    const reader = new FileReader();
    reader.onload = async (e) => {
        const arrayBuffer = e.target.result;
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const channelData = audioBuffer.getChannelData(0); // Using the first channel

        const binaryMessage = stringToBinary(messageToEncode) + '00000000'; // Null terminator for the end of the message

        // Process samples
        for (let i = 0; i < binaryMessage.length && i < channelData.length; i++) {
            let sample = channelData[i];
            let bit = parseInt(binaryMessage[i], 2);

            let wasNeg = sample < 0;
            let intSample = Math.abs(Math.floor(sample * (1 << 32)));  // convert to int
            console.log(intSample.toString(2));
            intSample = (intSample & ~1) | bit;  // set LSB
            channelData[i] = -(wasNeg ? -intSample / (1 << 32) : intSample / (1 << 32));  // convert back to float
        }

        // Optionally play audio directly in the browser to check sound
        //playAudio(audioBuffer, audioContext);

        // Use OfflineAudioContext to generate the final audio file
        const offlineContext = new OfflineAudioContext(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate);
        const offlineBuffer = offlineContext.createBuffer(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate);
        offlineBuffer.copyToChannel(channelData, 0, 0);
        console.log(decodeLSB(offlineBuffer.getChannelData(0)));
        const renderedBuffer = await offlineContext.startRendering();
        const wavBlob = bufferToWave(offlineBuffer, renderedBuffer.length);
        const downloadUrl = window.URL.createObjectURL(wavBlob);
        let renderedContext = new AudioContext();
        playAudio(offlineBuffer, renderedContext);

        // Set up the download link
        const link = document.querySelector("a[id='download']");
        link.href = downloadUrl;
        link.download = 'modified_audio.wav';
        link.style.display = 'inline';
    };

    reader.readAsArrayBuffer(audioFileToUse);
}

function bufferToWave(audioBuffer, length) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const bitDepth = 32;  // 32 bits for IEEE floating point

    // Block align (number of bytes per sample slice per channel)
    const blockAlign = numberOfChannels * (bitDepth / 8);
    // Byte rate (number of bytes per second)
    const byteRate = sampleRate * blockAlign;
    // Data size (total number of bytes of raw audio data)
    const dataSize = length * blockAlign;

    // Create a buffer and a DataView to interact with it
    const buffer = new ArrayBuffer(44 + dataSize);  // 44 bytes for header
    const view = new DataView(buffer);

    // Writing the RIFF header
    writeString(view, 0, 'RIFF');                      // ChunkID
    view.setUint32(4, 36 + dataSize, true);            // ChunkSize
    writeString(view, 8, 'WAVE');                      // Format

    // Writing the 'fmt ' sub-chunk
    writeString(view, 12, 'fmt ');                     // Subchunk1ID
    view.setUint32(16, 16, true);                      // Subchunk1Size
    view.setUint16(20, 3, true);                       // AudioFormat (3 for IEEE float)
    view.setUint16(22, numberOfChannels, true);        // NumChannels
    view.setUint32(24, sampleRate, true);              // SampleRate
    view.setUint32(28, byteRate, true);                // ByteRate
    view.setUint16(32, blockAlign, true);              // BlockAlign
    view.setUint16(34, bitDepth, true);                // BitsPerSample

    // Writing the 'data' sub-chunk
    writeString(view, 36, 'data');                     // Subchunk2ID
    view.setUint32(40, dataSize, true);                // Subchunk2Size

    // Write the PCM data
    let offset = 44;  // Start of data section
    for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sample = audioBuffer.getChannelData(channel)[i];
            view.setFloat32(offset, sample, true);     // Write the floating-point data
            offset += 4;  // Move the offset by 4 bytes for the next sample
        }
    }

    return new Blob([buffer], { type: "audio/wav" });

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
}


// Decode function
async function decode() {
    console.log('Starting decoding process...');
    const fileInput = document.querySelector("input[name='decFile']");
    const file = fileInput.files[0];
    const decrypt = document.getElementById('decrypt').value;
    let decryptKey = document.getElementById('decryptKey').value;

    if (!file) {
        alert('Please upload an audio file.');
        return;
    }
    if (decrypt) {
        if (!decryptKey) {
            alert('Please enter a key to decrypt with.');
            return;
        }
        decryptKey = decryptKey.toUpperCase();
        if (decryptKey.match(/[^A-Z]/g)) {
            alert('Please enter a valid key (only alphabetic characters)');
            return;
        }
    }

    console.log('Audio file for decoding retrieved successfully.');

    const reader = new FileReader();
    reader.onload = async (e) => {
        const arrayBuffer = e.target.result;
        console.log('ArrayBuffer byteLength:', arrayBuffer.byteLength); // Check the ArrayBuffer size

        const audioContext = new AudioContext();

        //try {
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const channelData = audioBuffer.getChannelData(0); // Using the first channel
            let decMessage = decodeLSB(channelData);
            if(decrypt) {
                decMessage = vigenereDec(decMessage, decryptKey)
            }
            document.querySelector("div[id='decMessage']").textContent = decMessage;
        /*} catch (error) {
            console.error('Error decoding audio data:', error);
            alert('Failed to decode the audio data. Please check the console for more details.');
        }*/
    };

    reader.onerror = (err) => {
        console.error('Error reading the file:', err);
        alert('Error reading the file. Please check the console for more details.');
    };

    reader.readAsArrayBuffer(file);
}

// Function to decode the LSB from channel data
function decodeLSB(channelData) {
    let decMessage = '';
    let bitString = '';

    for (let i = 0; i < channelData.length; i++) {
        let sample = channelData[i];
        if (i < 30) console.log(sample.toString(2));
        // Convert float sample to integer
        let wasNeg = sample < 0;
        let intSample = Math.abs(Math.floor(sample * (1 << 32)));
        // Extract the LSB
        let bit = intSample & 1;
        bitString += bit.toString();

        // Check for each byte and convert it to character
        if (bitString.length === 8) {
            let charCode = parseInt(bitString, 2);
            if (charCode === 0) {  // Check for null terminator
                break;
            }
            decMessage += String.fromCharCode(charCode);
            bitString = '';  // Reset for next character
        }
    }

    return decMessage;
}










"use strict";

// Function to convert a string to binary
function stringToBinary(input) {
    return input.split('').map(char => char.charCodeAt(0).toString(2).padStart(8, '0')).join('');
}

// Function to play audio directly in the browser
function playAudio(buffer, context) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();
    console.log('Playing encoded audio...');
}

function vigenereEnc(msg, key) {
    const alphabetUpper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const alphabetLower = "abcdefghijklmnopqrstuvwxyz";

    var k = [];
    for (const c of key.toUpperCase()) k.push(alphabetUpper.indexOf(c));
    var new_msg = "";

    var k_i = 0;
    for (const c of msg) {
        k_i %= k.length;
        if (alphabetLower.includes(c)) {
            new_msg += alphabetLower[(alphabetLower.indexOf(c) + k[k_i]) % 26];
            k_i++;
        } else if (alphabetUpper.includes(c)) {
            new_msg += alphabetUpper[(alphabetUpper.indexOf(c) + k[k_i]) % 26];
            k_i++;
        } else {
            new_msg += c;
        }
    }

    return new_msg;
}

function vigenereDec(msg, key) {
    const alphabetLower = "abcdefghijklmnopqrstuvwxyz"
    const alphabetUpper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

    var k = [];
    for (const c of key) k.push(alphabetUpper.indexOf(c));
    var new_msg = "";

    var k_i = 0;
    for (const c of msg) {
        k_i %= k.length;
        if (alphabetLower.includes(c)) {
            new_msg += alphabetLower[(alphabetLower.indexOf(c) - k[k_i] + 26) % 26];
            k_i++;
        } else if (alphabetUpper.includes(c)) {
            new_msg += alphabetUpper[(alphabetUpper.indexOf(c) - k[k_i] + 26) % 26];
            k_i++;
        } else {
            new_msg += c;
        }
    }
    return new_msg;
}


// Encode function
async function encode() {
    console.log('Starting encoding process...');

    const startFile = document.querySelector("input[name='startFile']").files[0];
    const secretMessage = document.querySelector("textarea").value;
    const audioInput = document.getElementById('audioInput').files[0];
    const message = document.getElementById('messageInput').value;
    const encrypt = document.getElementById('encrypt').checked;
    let encryptKey = document.getElementById('encryptKey').value;

    const audioFileToUse = startFile || audioInput;
    let messageToEncode = secretMessage || message;

    if (!audioFileToUse) {
        alert('Please upload an audio file.');
        return;
    }
    if (!messageToEncode) {
        alert('Please enter a message to encode.');
        return;
    }
    if (encrypt) {
        if (!encryptKey) {
            alert('Please enter a key to encrypt with.');
            return;
        }
        encryptKey = encryptKey.toUpperCase();
        if (encryptKey.match(/[^A-Z]/g)) {
            alert('Please enter a valid key (only alphabetic characters)');
            return;
        }

        messageToEncode = vigenereEnc(messageToEncode, encryptKey)
    }

    console.log('Audio file and message retrieved successfully.');

    const reader = new FileReader();
    reader.onload = async function () {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const decodedAudioData = await audioContext.decodeAudioData(reader.result);
        const sampleRate = 16000; // Lower sample rate for smaller file size and faster processing
        const offlineAudioContext = new OfflineAudioContext(1, sampleRate * decodedAudioData.duration, sampleRate);
        const soundSource = offlineAudioContext.createBufferSource();
        soundSource.buffer = decodedAudioData;

        const renderedBuffer = await offlineAudioContext.startRendering();

        const channelData = decodedAudioData.getChannelData(0); // Using the first channel

        const binaryMessage = stringToBinary(messageToEncode) + '00000000'; // Null terminator for the end of the message

        // Process samples
        for (let i = 0; i < binaryMessage.length && i < channelData.length; i++) {
            let sample = channelData[i];
            let bit = parseInt(binaryMessage[i], 2);

            let wasNeg = sample < 0;
            let intSample = Math.abs(Math.floor(sample * (1 << 32)));  // convert to int
            intSample = (intSample & ~1) | bit;  // set LSB
            channelData[i] = -(wasNeg ? -intSample / (1 << 32) : intSample / (1 << 32));  // convert back to float
        }

        // Optionally play audio directly in the browser to check sound
        //playAudio(audioBuffer, audioContext);

        // Use OfflineAudioContext to generate the final audio file
        const offlineContext = new OfflineAudioContext(decodedAudioData.numberOfChannels, decodedAudioData.length, decodedAudioData.sampleRate);
        const offlineBuffer = offlineContext.createBuffer(decodedAudioData.numberOfChannels, decodedAudioData.length, decodedAudioData.sampleRate);
        offlineBuffer.copyToChannel(channelData, 0, 0);
        console.log(decodeLSB(offlineBuffer.getChannelData(0)));
        const renderedBufferPost = await offlineContext.startRendering();
        const wavBlob = bufferToWave(offlineBuffer, renderedBufferPost.length);
        const downloadUrl = window.URL.createObjectURL(wavBlob);
        let renderedContext = new AudioContext();
        playAudio(offlineBuffer, renderedContext);

        // Set up the download link
        const link = document.querySelector("a[id='download']");
        link.href = downloadUrl;
        link.download = 'modified_audio.wav';
        link.style.display = 'inline';
    };

    reader.readAsArrayBuffer(audioFileToUse);
}

function bufferToWave(audioBuffer, length) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const bitDepth = 32;  // 32 bits for IEEE floating point

    // Block align (number of bytes per sample slice per channel)
    const blockAlign = numberOfChannels * (bitDepth / 8);
    // Byte rate (number of bytes per second)
    const byteRate = sampleRate * blockAlign;
    // Data size (total number of bytes of raw audio data)
    const dataSize = length * blockAlign;

    // Create a buffer and a DataView to interact with it
    const buffer = new ArrayBuffer(44 + dataSize);  // 44 bytes for header
    const view = new DataView(buffer);

    // Writing the RIFF header
    writeString(view, 0, 'RIFF');                      // ChunkID
    view.setUint32(4, 36 + dataSize, true);            // ChunkSize
    writeString(view, 8, 'WAVE');                      // Format

    // Writing the 'fmt ' sub-chunk
    writeString(view, 12, 'fmt ');                     // Subchunk1ID
    view.setUint32(16, 16, true);                      // Subchunk1Size
    view.setUint16(20, 3, true);                       // AudioFormat (3 for IEEE float)
    view.setUint16(22, numberOfChannels, true);        // NumChannels
    view.setUint32(24, sampleRate, true);              // SampleRate
    view.setUint32(28, byteRate, true);                // ByteRate
    view.setUint16(32, blockAlign, true);              // BlockAlign
    view.setUint16(34, bitDepth, true);                // BitsPerSample

    // Writing the 'data' sub-chunk
    writeString(view, 36, 'data');                     // Subchunk2ID
    view.setUint32(40, dataSize, true);                // Subchunk2Size

    // Write the PCM data
    let offset = 44;  // Start of data section
    for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sample = audioBuffer.getChannelData(channel)[i];
            view.setFloat32(offset, sample, true);     // Write the floating-point data
            offset += 4;  // Move the offset by 4 bytes for the next sample
        }
    }

    return new Blob([buffer], { type: "audio/wav" });

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
}


// Decode function
async function decode() {
    console.log('Starting decoding process...');
    const fileInput = document.querySelector("input[name='decFile']");
    const file = fileInput.files[0];
    const decrypt = document.getElementById('decrypt').checked;
    let decryptKey = document.getElementById('decryptKey').value;

    if (!file) {
        alert('Please upload an audio file.');
        return;
    }
    if (decrypt) {
        if (!decryptKey) {
            alert('Please enter a key to decrypt with.');
            return;
        }
        decryptKey = decryptKey.toUpperCase();
        if (decryptKey.match(/[^A-Z]/g)) {
            alert('Please enter a valid key (only alphabetic characters)');
            return;
        }
    }

    console.log('Audio file for decoding retrieved successfully.');

    const reader = new FileReader();
    reader.onload = async (e) => {
        const arrayBuffer = e.target.result;
        console.log('ArrayBuffer byteLength:', arrayBuffer.byteLength); // Check the ArrayBuffer size

        const audioContext = new AudioContext();

        //try {
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const channelData = audioBuffer.getChannelData(0); // Using the first channel
        let decMessage = decodeLSB(channelData);
        if (decrypt) {
            decMessage = vigenereDec(decMessage, decryptKey)
        }
        document.querySelector("div[id='decMessage']").textContent = decMessage;
        /*} catch (error) {
            console.error('Error decoding audio data:', error);
            alert('Failed to decode the audio data. Please check the console for more details.');
        }*/
    };

    reader.onerror = (err) => {
        console.error('Error reading the file:', err);
        alert('Error reading the file. Please check the console for more details.');
    };

    reader.readAsArrayBuffer(file);
}

// Function to decode the LSB from channel data
function decodeLSB(channelData) {
    let decMessage = '';
    let bitString = '';

    for (let i = 0; i < channelData.length; i++) {
        let sample = channelData[i];
        if (i < 30) console.log(sample.toString(2));
        // Convert float sample to integer
        let wasNeg = sample < 0;
        let intSample = Math.abs(Math.floor(sample * (1 << 32)));
        // Extract the LSB
        let bit = intSample & 1;
        bitString += bit.toString();

        // Check for each byte and convert it to character
        if (bitString.length === 8) {
            let charCode = parseInt(bitString, 2);
            if (charCode === 0) {  // Check for null terminator
                break;
            }
            decMessage += String.fromCharCode(charCode);
            bitString = '';  // Reset for next character
        }
    }

    return decMessage;
}



async function convertToMp3(videoFileData, targetAudioFormat = 'mp3') {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function () {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            try {
                const decodedAudioData = await audioContext.decodeAudioData(reader.result);
                const sampleRate = 16000; // Lower sample rate for smaller file size and faster processing
                const offlineAudioContext = new OfflineAudioContext(1, sampleRate * decodedAudioData.duration, sampleRate);
                const soundSource = offlineAudioContext.createBufferSource();
                soundSource.buffer = decodedAudioData;

                const renderedBuffer = await offlineAudioContext.startRendering();
                resolve(renderedBuffer);
                /*const blob = bufferToWave(renderedBuffer);
                const blobUrl = URL.createObjectURL(blob);

                resolve({
                    name: videoFileData.name.replace(/\.[^/.]+$/, ""),
                    format: targetAudioFormat,
                    data: blobUrl
                });*/
            } catch (err) {
                reject(`Error processing audio: ${err.message}`);
            }
        };
        reader.onerror = (err) => reject(`Error reading file: ${err.message}`);
        reader.readAsArrayBuffer(videoFileData);
    });
}

function bufferToWave(audioBuffer) {  // overloaded bufferToWave function for use in inconvertToMp3()
    const numOfChan = audioBuffer.numberOfChannels;
    const length = audioBuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let sample;
    let offset = 0;
    let pos = 0;

    // Write WAV header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(audioBuffer.sampleRate);
    setUint32(audioBuffer.sampleRate * 2 * numOfChan); // byte rate
    setUint16(numOfChan * 2); // block align
    setUint16(16); // bits per sample

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    // Write PCM samples
    for (let i = 0; i < audioBuffer.numberOfChannels; i++)
        channels.push(audioBuffer.getChannelData(i));

    while (pos < length) {
        for (let i = 0; i < numOfChan; i++) { // interleave channels
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
            view.setInt16(pos, sample, true); // write 16-bit sample
            pos += 2;
        }
        offset++ // next source sample
    }

    return new Blob([buffer], { type: 'audio/wav' });

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}