"""Alineación CTC por Viterbi. No interpola tiempos ni sustituye el texto."""
import math
import unicodedata
import numpy as np


def normalized_word(text):
    return ''.join(c for c in unicodedata.normalize('NFKC', text).lower() if c.isalpha() or c.isdigit())


def log_softmax(values):
    values = np.asarray(values, dtype=np.float32)
    if values.ndim != 2 or not np.isfinite(values).all():
        raise ValueError('El modelo produjo emisiones inválidas')
    centered = values - values.max(axis=1, keepdims=True)
    return centered - np.log(np.exp(centered).sum(axis=1, keepdims=True))


def edit_distance(a, b):
    row = np.arange(len(b) + 1, dtype=np.int32)
    for i, char in enumerate(a):
        nxt = np.empty_like(row)
        nxt[0] = i + 1
        for j, other in enumerate(b):
            nxt[j + 1] = min(nxt[j] + 1, row[j + 1] + 1, row[j] + (char != other))
        row = nxt
    return int(row[-1])


def greedy_text(logp, labels, blank):
    result = []
    previous = None
    for token in np.argmax(logp, axis=1):
        token = int(token)
        if token != blank and token != previous:
            result.append(labels.get(token, ''))
        previous = token
    return ''.join(result).replace('|', ' ')


def viterbi(logp, tokens, blank):
    """CTC completo: repetición, avance y salto legal de estados blancos."""
    frames = logp.shape[0]
    if not tokens or frames == 0:
        return None
    minimum = len(tokens) + sum(a == b for a, b in zip(tokens, tokens[1:]))
    if minimum > frames:
        return None
    states = np.full(2 * len(tokens) + 1, blank, dtype=np.int32)
    states[1::2] = tokens
    can_skip = np.zeros(len(states), dtype=bool)
    can_skip[2:] = (states[2:] != blank) & (states[2:] != states[:-2])
    previous = np.full(len(states), -np.inf, dtype=np.float32)
    previous[0] = logp[0, blank]
    previous[1] = logp[0, tokens[0]]
    choices = np.zeros((frames, len(states)), dtype=np.uint8)
    for time in range(1, frames):
        advance = np.full_like(previous, -np.inf)
        skip = np.full_like(previous, -np.inf)
        advance[1:] = previous[:-1]
        skip[2:] = np.where(can_skip[2:], previous[:-2], -np.inf)
        candidates = np.stack([previous, advance, skip])
        choices[time] = np.argmax(candidates, axis=0)
        previous = np.max(candidates, axis=0) + logp[time, states]
    at = len(states) - (1 if previous[-1] >= previous[-2] else 2)
    if not np.isfinite(previous[at]):
        return None
    path = np.empty(frames, dtype=np.int32)
    path[-1] = at
    for time in range(frames - 1, 0, -1):
        at -= int(choices[time, at])
        path[time - 1] = at
    if path[0] not in (0, 1):
        raise ValueError('Trayectoria CTC inválida')
    return path


def align(logits, words, vocab, blank, stride, receptive, rate, window_start, cue_start, cue_end):
    text = [normalized_word(w) for w in words]
    if not text or any(not w for w in text):
        return {'status': 'unsupported', 'reason': 'El texto no contiene palabras que se puedan alinear.'}
    unknown = sorted(set(''.join(text)) - set(vocab))
    if unknown:
        return {'status': 'unsupported', 'reason': 'Caracteres sin correspondencia acústica: ' + ' '.join(unknown[:12])}
    if sum(map(len, text)) > 1200:
        return {'status': 'unsupported', 'reason': 'El subtítulo supera el límite de texto para alinear.'}
    tokens, owners = [], []
    for index, word in enumerate(text):
        if index:
            tokens.append(vocab['|'])
            owners.append(-1)
        tokens.extend(vocab[c] for c in word)
        owners.extend([index] * len(word))
    logp = log_softmax(logits)
    path = viterbi(logp, tokens, blank)
    if path is None:
        return {'status': 'review', 'reason': 'El audio no permite distribuir todas las letras del texto.'}
    labels = {value: key if len(key) == 1 else '' for key, value in vocab.items()}
    centers = window_start + (np.arange(len(logp)) * stride + receptive / 2) / rate
    within = (centers >= cue_start) & (centers < cue_end)
    decoded = greedy_text(logp[within], labels, blank) if within.any() else ''
    acoustic = normalized_word(decoded)
    target = ''.join(text)
    agreement = 1 - edit_distance(target, acoustic) / max(len(target), len(acoustic), 1)
    results, all_char_scores = [], []
    for word_index, original in enumerate(words):
        token_ids = [i for i, owner in enumerate(owners) if owner == word_index]
        assigned = [np.flatnonzero(path == 2 * i + 1) for i in token_ids]
        if any(len(a) == 0 for a in assigned):
            return {'status': 'review', 'reason': 'No se encontró una trayectoria completa para cada palabra.'}
        scores = [float(logp[indices, tokens[i]].mean()) for i, indices in zip(token_ids, assigned)]
        confidence = math.exp(sum(scores) / len(scores))
        all_char_scores.extend(scores)
        start = window_start + (assigned[0][0] * stride + receptive / 2) / rate
        end = window_start + ((assigned[-1][-1] + 1) * stride + receptive / 2) / rate
        if start < cue_start - .025 or end > cue_end + .025:
            return {'status': 'review', 'reason': 'Hay palabras fuera de los tiempos del subtítulo. Ajusta su entrada o salida.', 'agreement': agreement}
        results.append({'text': original, 'start': max(cue_start, float(start)), 'end': min(cue_end, float(end)), 'confidence': confidence})
    mean = math.exp(sum(all_char_scores) / len(all_char_scores))
    minimum = min(w['confidence'] for w in results)
    eligible = mean >= .35 and minimum >= .08 and agreement >= .65
    return {'status': 'aligned' if eligible else 'review', 'reason': None if eligible else 'La coincidencia acústica es baja. Revisa el texto y escucha el fragmento.',
            'words': results if eligible else [], 'scoreMean': mean, 'scoreMinWord': minimum, 'agreement': agreement,
            'greedyText': decoded[:1200], 'thresholds': {'mean': .35, 'minimumWord': .08, 'agreement': .65}}
