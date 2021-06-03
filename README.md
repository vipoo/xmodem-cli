## Xmodem cli tool

A simple tool to transmit a file over a COM/Serial Port using the XMODEM protocol

### Dependencies

* Requires node 16.3.0 or higher

### Installing

```
git clone ...

npm ci
```

### Usage:

```
Usage: xmodem [options] <port> <filename>

Transmit the file over serial port using the xmodem protocol

Options:
  -b, --baud <baud-rate>  the baud rate to use (default: 38400)
  -h, --help              display help for command
```
