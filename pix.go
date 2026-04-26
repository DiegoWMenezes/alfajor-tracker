package main

import (
	"fmt"
	"os"
	"strings"
)

// Gerador de Payload Pix EMV (BRCode) para "copia e cola"
// Baseado na especificacao do Banco Central: QR Code EMV para Pix

func getMerchantInfo() (key, name, city string) {
	key = os.Getenv("PIX_KEY")
	name = os.Getenv("PIX_NAME")
	city = os.Getenv("PIX_CITY")
	return
}

func isPixConfigured() bool {
	key, _, _ := getMerchantInfo()
	return key != ""
}

// GeneratePixPayload gera o codigo Pix "copia e cola" para um pedido
func GeneratePixPayload(txid string, amountCents int) string {
	key, name, city := getMerchantInfo()
	if key == "" {
		return ""
	}

	// Formata valor em reais com 2 casas decimais
	amount := fmt.Sprintf("%.2f", float64(amountCents)/100.0)

	// Limpa nome e cidade (sem acentos, sem caracteres especiais)
	name = sanitizePix(name)
	city = sanitizePix(city)

	// Limita nome a 25 chars e cidade a 15 chars (especificacao EMV)
	if len(name) > 25 {
		name = name[:25]
	}
	if len(city) > 15 {
		city = city[:15]
	}

	// Monta o payload EMV
	var payload strings.Builder

	// ID 00 - Payload Format Indicator
	payload.WriteString(emvField("00", "01"))

	// ID 26 - Merchant Account Information (Pix)
	var merchant strings.Builder
	merchant.WriteString(emvField("00", "br.gov.bcb.pix")) // GUI
	merchant.WriteString(emvField("01", key))              // Chave Pix
	payload.WriteString(emvField("26", merchant.String()))

	// ID 52 - Merchant Category Code
	payload.WriteString(emvField("52", "0000"))

	// ID 53 - Transaction Currency (986 = BRL)
	payload.WriteString(emvField("53", "986"))

	// ID 54 - Transaction Amount
	payload.WriteString(emvField("54", amount))

	// ID 58 - Country Code
	payload.WriteString(emvField("58", "BR"))

	// ID 59 - Merchant Name
	payload.WriteString(emvField("59", name))

	// ID 60 - Merchant City
	payload.WriteString(emvField("60", city))

	// ID 62 - Additional Data Field Template
	var additional strings.Builder
	// txid: ate 25 caracteres alfanumericos
	txidClean := sanitizePix(txid)
	if len(txidClean) > 25 {
		txidClean = txidClean[:25]
	}
	additional.WriteString(emvField("05", txidClean))
	payload.WriteString(emvField("62", additional.String()))

	// ID 63 - CRC16 (calculado por ultimo)
	payloadStr := payload.String() + "6304"
	crc := crc16CCITT(payloadStr)
	payload.WriteString(fmt.Sprintf("63%04X", crc))

	return payload.String()
}

// emvField monta um campo no formato ID+Length+Value
func emvField(id, value string) string {
	return fmt.Sprintf("%s%02d%s", id, len(value), value)
}

// sanitizePix remove acentos e caracteres especiais para o padrao EMV
func sanitizePix(s string) string {
	replacements := map[string]string{
		"á": "a", "à": "a", "ã": "a", "â": "a", "ä": "a",
		"Á": "A", "À": "A", "Ã": "A", "Â": "A", "Ä": "A",
		"é": "e", "è": "e", "ê": "e", "ë": "e",
		"É": "E", "È": "E", "Ê": "E", "Ë": "E",
		"í": "i", "ì": "i", "î": "i", "ï": "i",
		"Í": "I", "Ì": "I", "Î": "I", "Ï": "I",
		"ó": "o", "ò": "o", "ô": "o", "õ": "o", "ö": "o",
		"Ó": "O", "Ò": "O", "Ô": "O", "Õ": "O", "Ö": "O",
		"ú": "u", "ù": "u", "û": "u", "ü": "u",
		"Ú": "U", "Ù": "U", "Û": "U", "Ü": "U",
		"ç": "c", "Ç": "C",
		"ñ": "n", "Ñ": "N",
		"ß": "ss",
	}
	result := s
	for from, to := range replacements {
		result = strings.ReplaceAll(result, from, to)
	}

	// Mantem apenas letras, numeros e espaco
	var cleaned strings.Builder
	for _, r := range result {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == ' ' {
			cleaned.WriteRune(r)
		}
	}
	return cleaned.String()
}

// crc16CCITT calcula o CRC16-CCITT usado no Pix
func crc16CCITT(data string) uint16 {
	crc := uint16(0xFFFF)
	for _, b := range []byte(data) {
		crc ^= uint16(b) << 8
		for i := 0; i < 8; i++ {
			if crc&0x8000 != 0 {
				crc = (crc << 1) ^ 0x1021
			} else {
				crc <<= 1
			}
		}
	}
	return crc & 0xFFFF
}