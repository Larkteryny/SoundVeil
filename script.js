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

let lang = 'EN'
function changeLang() {
    if(lang == 'EN') {
        lang = 'FR';
        document.querySelector('nav[class="navbar"]').innerHTML = `<a href="index.html" class="fontdef">Accueil</a>
        <a href="instructions.html" class="fontdef">Guide</a>
        <a href="about.html" class="fontdef">Qui sommes-nous</a>
        <a href="encode.html" class="fontdef">Encoder</a>
        <a href="decode.html" class="fontdef">Decoder</a>
        <a class="fontdef" onclick="changeLang()" id="language">FR</a>`;

        console.log(document.querySelector('title').innerHTML);

        if(document.querySelector('title').innerHTML == "SoundVeil") {
            document.querySelector("div[class='p']").innerHTML = `<p> Le gouvernement est tombé. Vous devez envoyer un message à votre famille pour survivre. Les espions et les bandits sont
            écouter chaque transmission audio. Que fais-tu? SoundVeil vous permet de transmettre des messages cachés qui
            sont imperceptibles à l’oreille humaine. </p>`;
            document.querySelector('a[class="a"]').innerHTML = "<span>ENCODEZ</span>";
            document.querySelector('a[class="a1"]').innerHTML = "<span>DECODEZ</span>";
        } else if(document.querySelector('title').innerHTML == "Guide") {
            document.querySelector('h1').innerHTML = "Comment utiliser ce projet";
            document.querySelector('div[class="p"]').innerHTML = `<p>L'encodeur dissimule un message texte dans un fichier audio. Tous les fichiers audio/vidéo (mp4, mov, mp4, wav) sont pris en charge via le téléchargement de fichiers. Entrez votre message secret dans la zone de texte et un nouveau fichier audio le contenant sera fourni. Pour plus de sécurité, vous pouvez également choisir de chiffrer votre message secret et de fournir une clé (caractères alphabétiques uniquement).</p>
            <p>Le décodeur extrait un message texte à partir d'un fichier audio. Si l'expéditeur a chiffré le message avec une clé, vous pouvez fournir la même clé pour obtenir le message d'origine.</p>`;
        } else if(document.querySelector('title').innerHTML == "About Us") {
            document.querySelector('h1').innerHTML = 'À propos de ce projet';
            document.querySelector("div[id='aboutText']").innerHTML = `<p> Ce projet a été réalisé pour les YRHacks 2024 par une équipe de quatre amis.</p>
            <p> SoundVeil dissimule les données dans les bits les moins significatifs des échantillons audio, des différences trop légères
              pour les humains à détecter, mais toujours capable d'être extrait par le décodeur intégré de SoundVeil. De plus, nous proposons
              une couche supplémentaire (facultative) de cryptage utilisant un chiffre de Vigenère, beaucoup plus difficile à déchiffrer
              qu'un chiffre de César et qui évolue en sécurité avec la longueur de la clé.</p>
            <p> Merci d'avoir consulté notre hack</p>
            <p>&emsp; - Sincèrement, Ethan, Joey, Rashid, & Terry</p>`;
        } else if(document.querySelector('title').innerHTML == 'Encode') {
            document.querySelector('h1[class="h1encoder"]').innerHTML = "Encodez votre message";
            document.querySelector('div[class="buttonDes"]').innerHTML = `
            Choisissez le fichier
            <input type="file" class = "hide_file" id="audioInput" accept="audio/*" name="startFile">`;
            document.querySelector('div[class="buttonName"]').innerHTML = `
            Cryptez: &nbsp
            <label class="switch">
                <input type="checkbox" id="encrypt">
                &nbsp
                <span class="slider round"></span>
            </label>
            <input type="text" id="encryptKey" placeholder="Votre mot-clé secret">`;
            document.querySelector('button[class="buttonDes"]').innerHTML = "Encodez";
            document.querySelector('a[id="download"]').innerHTML = "Téléchargez l'audio codé";
            document.querySelector('textarea[id="messageInput"]').placeholder = "Votre message secret 🤫";
        } else if(document.querySelector('title').innerHTML == 'Decode') {
            document.querySelector('h1[class="parent"]').innerHTML = "Décoder les messages cachés";
            document.querySelector('h4[class="h4des"]').innerHTML = "Décryptez:";
            document.querySelector('input[id="decryptKey"]').placeholder = "Votre mot-clé secret";
            document.querySelector('button[class="button"]').innerHTML = "Decodez";
            document.querySelector('div[id="decMessage"]').innerHTML = "Votre message décodé apparaîtra ici...";
        }
    } else if(lang == 'FR') {
        lang = 'CN';
        document.querySelector('nav[class="navbar"]').innerHTML = `<a href="index.html" class="fontdef">首頁</a>
        <a href="instructions.html" class="fontdef">指导</a>
        <a href="about.html" class="fontdef">关于我们</a>
        <a href="encode.html" class="fontdef">编码器</a>
        <a href="decode.html" class="fontdef">解码器</a>
        <a class="fontdef" onclick="changeLang()" id="language">中文</a>`;

        console.log(document.querySelector('title').innerHTML);

        if(document.querySelector('title').innerHTML == "SoundVeil") {
            document.querySelector("div[class='p']").innerHTML = `<p> 政府倒台了。 为了生存，您必须向家人发送信息。 间谍和土匪是
            监听每一个音频传输。 你做什么工作？ SoundVeil 允许您传输隐藏的消息
            人耳无法察觉。 </p>`;
            document.querySelector('a[class="a"]').innerHTML = "<span>编码</span>";
            document.querySelector('a[class="a1"]').innerHTML = "<span>解码</span>";
        } else if(document.querySelector('title').innerHTML == "Guide") {
            document.querySelector('h1').innerHTML = "如何使用这个项目";
            document.querySelector('div[class="p"]').innerHTML = `<p>编码器将文本消息隐藏到音频文件中。 通过文件上传支持任何音频/视频（mp4、mov、mp4、wav）文件。 在文本区域中输入您的秘密消息，然后将提供包含该消息的新音频文件。 为了提高安全性，您还可以选择加密您的秘密消息并提供密钥（仅限字母字符）。</p>
            <p>解码器从音频文件中提取文本消息。 如果发件人使用密钥对消息进行加密，您可以提供相同的密钥来获取原始消息。</p>`;
        } else if(document.querySelector('title').innerHTML == "About Us") {
            document.querySelector('h1').innerHTML = '关于这个项目';
            document.querySelector("div[id='aboutText']").innerHTML = `<p> 这个项目是由四位朋友组成的团队为 2024 年 YRHacks 制作的。</p>
            <p> SoundVeil 隐藏了音频样本最低有效位中的数据，差异太小
              供人类检测，但仍然能够被 SoundVeil 的内置解码器提取。 此外，我们还提供
              使用维吉尼亚密码的附加（可选）加密层，破解难度要大得多
              比凯撒密码更安全，并且其安全性随密钥长度而变化。</p>
              <p> 感谢<em>您</em>查看我们的黑客</p>
             <p>&emsp; - 此致，Ethan, Joey, Rashid, & Terry</p>`;
        } else if(document.querySelector('title').innerHTML == 'Encode') {
            document.querySelector('h1[class="h1encoder"]').innerHTML = "编码消息";
            document.querySelector('div[class="buttonDes"]').innerHTML = `
            选择文件
            <input type="file" class = "hide_file" id="audioInput" accept="audio/*" name="startFile">`;
            document.querySelector('div[class="buttonName"]').innerHTML = `
            加密: &nbsp
            <label class="switch">
                <input type="checkbox" id="encrypt">
                &nbsp
                <span class="slider round"></span>
            </label>
            <input type="text" id="encryptKey" placeholder="您的秘密关键字（需要英文字母）">`;
            document.querySelector('button[class="buttonDes"]').innerHTML = "编码";
            document.querySelector('a[id="download"]').innerHTML = "下载编码音频";
            document.querySelector('textarea[id="messageInput"]').placeholder = "你的秘密讯息🤫";
        } else if(document.querySelector('title').innerHTML == 'Decode') {
            document.querySelector('h1[class="parent"]').innerHTML = "解码隐藏消息";
            document.querySelector('h4[class="h4des"]').innerHTML = "解密:";
            document.querySelector('input[id="decryptKey"]').placeholder = "您的秘密关键字";
            document.querySelector('button[class="button"]').innerHTML = "解码";
            document.querySelector('div[id="decMessage"]').innerHTML = "解码后的消息将出现在此处...";
        }
    } else if(lang == 'CN') {
        lang = 'EN';
        document.querySelector('nav[class="navbar"]').innerHTML = `<a href="index.html" class="fontdef">Home</a>
        <a href="instructions.html" class="fontdef">Guide</a>
        <a href="about.html" class="fontdef">About Us</a>
        <a href="encode.html" class="fontdef">Encoder</a>
        <a href="decode.html" class="fontdef">Decoder</a>
        <a class="fontdef" onclick="changeLang()" id="language">EN</a>`;

        console.log(document.querySelector('title').innerHTML);

        if(document.querySelector('title').innerHTML == "SoundVeil") {
            document.querySelector("div[class='p']").innerHTML = `<p> The Government has fallen. You must send a message to your family for survival. Spies and bandits are
            listening to every audio transmission. What do you do? SoundVeil allows you to transmit hidden messages that
            are unnoticeable to the human ear. </p>`;
            document.querySelector('a[class="a"]').innerHTML = "<span>ENCODE</span>";
            document.querySelector('a[class="a1"]').innerHTML = "<span>DECODE</span>";
        } else if(document.querySelector('title').innerHTML == "Guide") {
            document.querySelector('h1').innerHTML = "How to Use This Project";
            document.querySelector('div[class="p"]').innerHTML = `<p>The Encoder conceals a text message into an audio file. Any audio/video (mp4, mov, mp4, wav) files are supported via file upload. Enter your secret message into the text area, and a new audio file will be provided containing it. For additional security, you may also choose to encrypt your secret message and provide a key (alphabetic characters only).</p> 
            <p>The Decoder extracts a text message from an audio file. If the sender encrypted the message with a key, you can supply the same key to obtain the original message.</p>`;
        } else if(document.querySelector('title').innerHTML == "About Us") {
            document.querySelector('h1').innerHTML = 'About This Project';
            document.querySelector("div[id='aboutText']").innerHTML = `<p> This project was made for the 2024 YRHacks by a team of four friends.</p>
            <p> SoundVeil conceals data in the least significant bits of audio samples, differences that are too slight
              for humans to detect, but still able to be extracted by SoundVeil's built-in decoder. Futhermore, we offer
              an additional (optional) layer of encryption using a Vigenère cipher, which is far more difficult to crack
              than a Caesar cipher and which scales in security with key length.</p>
            <p> Thank <em>you</em> for checking out our hack</p>
            <p>&emsp; - Sincerely, Ethan, Joey, Rashid, & Terry</p>`;
        } else if(document.querySelector('title').innerHTML == 'Encode') {
            document.querySelector('h1[class="h1encoder"]').innerHTML = "Encode Message";
            document.querySelector('div[class="buttonDes"]').innerHTML = `
            Choose File
            <input type="file" class = "hide_file" id="audioInput" accept="audio/*" name="startFile">`;
            document.querySelector('div[class="buttonName"]').innerHTML = `
            Encrypt: &nbsp
            <label class="switch">
                <input type="checkbox" id="encrypt">
                &nbsp
                <span class="slider round"></span>
            </label>
            <input type="text" id="encryptKey" placeholder="Your secret keyword">`;
            document.querySelector('button[class="buttonDes"]').innerHTML = "Encode";
            document.querySelector('a[id="download"]').innerHTML = "Download Encoded Audio";
            document.querySelector('textarea[id="messageInput"]').placeholder = "Your secret message 🤫";
        } else if(document.querySelector('title').innerHTML == 'Decode') {
            document.querySelector('h1[class="parent"]').innerHTML = "Decode Hidden Messages";
            document.querySelector('h4[class="h4des"]').innerHTML = "Decrypt:";
            document.querySelector('input[id="decryptKey"]').placeholder = "Your secret keyword";
            document.querySelector('button[class="button"]').innerHTML = "Decode";
            document.querySelector('div[id="decMessage"]').innerHTML = "Decoded message will appear here...";
        }
    }
}